// Supabase Edge Function — POST /chat
//
// DEPLOYED AND VERIFIED against the real project. Two things the initial
// unverified draft got wrong, found by an actual deploy attempt:
//   1. packages/core's `.js`-extension internal imports (Node/tsx
//      convention) aren't resolved by Deno's bundler — fixed by vendoring
//      into ../_shared/core/ (see its README.md for the full story).
//   2. coach-prompts/*.md was read at runtime via Deno.readTextFile with
//      a path reaching outside this function's directory — the deployed
//      function's filesystem doesn't have it (deploy only uploads what's
//      in the static import graph), confirmed by a live 404. Fixed by
//      generating ../_shared/prompts.ts (scripts/generate-edge-prompts.ts)
//      and importing it normally instead.
//
// Phase 3 added conversational logging: { messages, personality,
// pendingLog? } in, { reply, pendingLog? } out. `pendingLog` round-trips
// through the client exactly like `messages` already does (the client
// already resends full history every request) — no new table, no new
// persistence. If the app is killed mid-confirmation the proposal is
// simply lost; an accepted v1 limit (BRIEF-PHASE3.md's own plan).

import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  computeSessionStats,
  renderVerifiedStats,
  findMatchingSkips,
  determineRelevantSessionType,
  findExactSkipMatch,
  type CoreSession,
  type WeightEntry,
} from "../_shared/core/stats.ts";
import { resolvePersonality } from "../_shared/core/personality.ts";
import { CORE_RULES, PERSONALITY_PROMPTS } from "../_shared/prompts.ts";
import { suggestNextSession, renderSuggestedNextSession, type Program, type ProgressionEvent } from "../_shared/core/progression.ts";
import {
  looksLikeSetLog,
  looksLikeFoodLog,
  classifyConfirmation,
  applyCorrectionPatch,
  CONFIDENCE_THRESHOLD,
  type ExerciseLog,
  type PendingLogProposal,
  type CorrectionPatch,
} from "../_shared/core/logging.ts";
import { computeNextScheduledSession } from "../_shared/core/nextSession.ts";
import { computeFoodStats, renderFoodLog, type FoodEvent } from "../_shared/core/food.ts";

const FOOD_LOG_WINDOW_DAYS = 7;

interface PendingFoodLogProposal {
  text: string;
  items?: string[];
}

const MODEL = "claude-sonnet-4-6";

interface EventRow {
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

interface ExtractedExercise extends ExerciseLog {
  confidence: { exercise: number; weight_kg: number; reps: number; sets?: number; rpe?: number };
}

interface ExtractionResult {
  type: string;
  type_confidence: number;
  exercises: ExtractedExercise[];
}

function eventsToSessions(events: EventRow[]): CoreSession[] {
  return events
    .filter((e) => e.kind === "session_completed" || e.kind === "session_skipped")
    .map((e) => ({
      date: e.occurred_at.slice(0, 10),
      type: String(e.payload.type ?? "Unknown"),
      status: e.kind === "session_completed" ? "completed" : "skipped",
      excuse: e.payload.excuse as string | undefined,
    }));
}

function latestWeight(events: EventRow[]): WeightEntry | null {
  const weighIns = events.filter((e) => e.kind === "weight_logged").sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  if (weighIns.length === 0) return null;
  return { date: weighIns[0].occurred_at.slice(0, 10), weight_kg: Number(weighIns[0].payload.weight_kg) };
}

const EXTRACTION_TOOL = {
  name: "log_extraction",
  description: "Structured extraction of a logged workout session from free text. Never guess a value that isn't actually stated — omit it and score its confidence low instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: { type: "string", description: "Session type this belongs to: Push, Pull, or Legs" },
      type_confidence: { type: "number", description: "0-1, your genuine certainty in the session type" },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exercise: { type: "string" },
            weight_kg: { type: "number" },
            reps: { type: "number", description: "reps per set" },
            sets: { type: "number" },
            rpe: { type: "number", description: "omit if not stated" },
            confidence: {
              type: "object",
              properties: {
                exercise: { type: "number" },
                weight_kg: { type: "number" },
                reps: { type: "number" },
                sets: { type: "number" },
                rpe: { type: "number" },
              },
              required: ["exercise", "weight_kg", "reps"],
            },
          },
          required: ["exercise", "weight_kg", "reps", "sets", "confidence"],
        },
      },
    },
    required: ["type", "type_confidence", "exercises"],
  },
};

async function extractSetLog(anthropic: Anthropic, text: string): Promise<ExtractionResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `Extract structured set-logging data from the athlete's message using the log_extraction tool. Confidence must reflect genuine certainty — a field that wasn't stated gets low confidence, not a default guess.`,
    messages: [{ role: "user", content: text }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "log_extraction" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  return toolUse!.input as ExtractionResult;
}

const CORRECTION_TOOL = {
  name: "log_correction",
  description:
    "Identify ONLY what the athlete's correction message changes about a pending log proposal. Omit every field the message doesn't actually address — do not restate the full proposal, and never guess at a field just because it existed before. If the proposal has more than one exercise, include `exercise` naming which one this correction targets whenever that's not already obvious from context.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: { type: "string", description: "omit unless the session type itself is being corrected" },
      type_confidence: { type: "number", description: "0-1; required only if `type` is present" },
      exercise: {
        type: "string",
        description: "omit unless the exercise name is being corrected, or needed to say which exercise (when there's more than one) this correction targets",
      },
      weight_kg: { type: "number", description: "omit unless the weight is being corrected" },
      reps: { type: "number", description: "omit unless the reps are being corrected" },
      sets: { type: "number", description: "omit unless the set count is being corrected" },
      rpe: { type: "number", description: "omit unless the RPE is being corrected" },
      confidence: {
        type: "object",
        description: "confidence per field ACTUALLY PRESENT above — omit entries for fields you didn't include",
        properties: {
          exercise: { type: "number" },
          weight_kg: { type: "number" },
          reps: { type: "number" },
        },
      },
    },
    required: [],
  },
};

/**
 * The correction call, scoped to change-detection only — merging the
 * result into the existing pendingLog is applyCorrectionPatch's job, in
 * code (see _shared/core/logging.ts for why: the old version of this
 * function asked the model to reconstruct the whole proposal from a
 * "keep everything else" instruction, and it silently dropped fields
 * nobody re-stated).
 */
async function extractCorrection(anthropic: Anthropic, text: string, pendingLog: PendingLogProposal): Promise<CorrectionPatch> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `The athlete is correcting a pending log proposal (${JSON.stringify(pendingLog)}). Using the log_correction tool, identify ONLY what their message changes — omit every field it doesn't address.`,
    messages: [{ role: "user", content: text }],
    tools: [CORRECTION_TOOL],
    tool_choice: { type: "tool", name: "log_correction" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  return toolUse!.input as CorrectionPatch;
}

const FOOD_EXTRACTION_TOOL = {
  name: "food_log_extraction",
  description:
    "Determine whether the athlete's message genuinely reports what they ate or skipped, as opposed to a question, a plan, or idle conversation about food (\"what should I eat tonight?\" is NOT a log). If it is a real report, optionally identify discrete food items cleanly stated in the message — never invent an item that isn't actually there.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_food_log: {
        type: "boolean",
        description: "true only if this message reports something actually eaten or skipped, not a question or hypothetical",
      },
      items: {
        type: "array",
        items: { type: "string" },
        description: "discrete food items cleanly identifiable from the message — omit entirely if it doesn't cleanly break into items",
      },
    },
    required: ["is_food_log"],
  },
};

interface FoodExtractionResult {
  is_food_log: boolean;
  items?: string[];
}

/**
 * The model's only job here is deciding whether this is genuinely a food
 * report and, optionally, splitting it into items — it never produces
 * the stored text. `text` is always lastUserMessage itself, set in code
 * (Deno.serve below), matching the brief's "verbatim, exactly as said."
 */
async function extractFoodLog(anthropic: Anthropic, text: string): Promise<FoodExtractionResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: `Using the food_log_extraction tool, determine whether the athlete's message reports something they actually ate or skipped.`,
    messages: [{ role: "user", content: text }],
    tools: [FOOD_EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "food_log_extraction" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  return toolUse!.input as FoodExtractionResult;
}

/**
 * The write gate, in code: a field only survives into a pendingLog if
 * its confidence clears the threshold. Anything that doesn't produces a
 * list of exactly what's unclear, for the coach to ask about — the
 * ambiguity determination is code's, never the model's improvisation.
 */
function applyConfidenceGate(extraction: ExtractionResult): { pendingLog: PendingLogProposal | null; unclearFields: string[] } {
  const unclear: string[] = [];
  if (extraction.type_confidence < CONFIDENCE_THRESHOLD) {
    unclear.push("which session this was (Push/Pull/Legs)");
  }

  const goodExercises: ExerciseLog[] = [];
  for (const ex of extraction.exercises) {
    const c = ex.confidence;
    if (c.exercise < CONFIDENCE_THRESHOLD || c.weight_kg < CONFIDENCE_THRESHOLD || c.reps < CONFIDENCE_THRESHOLD) {
      unclear.push(`${ex.exercise || "one of the exercises"} (weight and/or reps)`);
      continue;
    }
    goodExercises.push({ exercise: ex.exercise, weight_kg: ex.weight_kg, reps: ex.reps, sets: ex.sets, rpe: ex.rpe });
  }

  if (unclear.length > 0 || goodExercises.length === 0) {
    return { pendingLog: null, unclearFields: unclear.length > 0 ? unclear : ["the exercises in that message"] };
  }

  return { pendingLog: { type: extraction.type, exercises: goodExercises }, unclearFields: [] };
}

/**
 * Idempotency check for the confirm branch, in code — field-by-field, no
 * library. Fixes the Phase 3 audit's other finding: resending an
 * already-confirmed pendingLog fell through toward a second insert and
 * 500'd. Whatever the exact cause, a duplicate confirm should never reach
 * the insert path at all.
 */
function payloadsMatch(a: PendingLogProposal, b: { type: string; exercises: ExerciseLog[] }): boolean {
  if (a.type !== b.type) return false;
  if (a.exercises.length !== b.exercises.length) return false;
  return a.exercises.every((ex, i) => {
    const other = b.exercises[i];
    return (
      ex.exercise === other.exercise &&
      ex.weight_kg === other.weight_kg &&
      ex.reps === other.reps &&
      ex.sets === other.sets &&
      (ex.rpe ?? null) === (other.rpe ?? null)
    );
  });
}

/**
 * Same idempotency discipline as payloadsMatch above, applied to food's
 * simpler single-field shape — added proactively here rather than
 * waiting to rediscover the duplicate-confirm crash a second time.
 */
function foodPayloadsMatch(a: PendingFoodLogProposal, b: { text: string }): boolean {
  return a.text.trim().toLowerCase() === b.text.trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, anonKey!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const messages = body?.messages;
  const personality = resolvePersonality(body?.personality);
  const pendingLog = body?.pendingLog as PendingLogProposal | undefined;
  const pendingFoodLog = body?.pendingFoodLog as PendingFoodLogProposal | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Request body must include a non-empty `messages` array." }), { status: 400 });
  }

  const lastUserMessage = [...messages].reverse().find((m: { role: string; content: string }) => m.role === "user")?.content ?? "";

  const [profileResult, { data: events }, { data: digests }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("events").select("occurred_at, kind, payload").eq("user_id", user.id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("memory_digests").select("period_start, period_end, digest").eq("user_id", user.id).order("period_start", { ascending: false }).limit(4),
  ]);
  const profile = profileResult.data;

  if (!profile) {
    return new Response(JSON.stringify({ error: "No profile for this user — onboarding incomplete." }), { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const allEvents = events ?? [];
  const sessions = eventsToSessions(allEvents);
  const verifiedStats = renderVerifiedStats(computeSessionStats(sessions, today), latestWeight(allEvents));

  const programEvent = allEvents.find((e) => e.kind === "program_changed");
  const program = programEvent ? (programEvent.payload as unknown as Program) : null;
  // next_session isn't part of the Program type (progression.ts only
  // needs name/exercises) but the same program_changed payload carries it
  // — this is the one piece proactive's renderState already rendered and
  // chat never did, the exact gap that let a future weekday get inferred
  // instead of computed (found by the casual-chat test, fixed here).
  const programNextSession = programEvent ? (programEvent.payload as { next_session?: { type: string } }).next_session : undefined;
  const progressionEvents: ProgressionEvent[] = allEvents
    .filter((e) => e.kind === "session_completed" || e.kind === "override")
    .map((e) => ({ occurred_at: e.occurred_at, kind: e.kind as "session_completed" | "override", payload: e.payload }));
  const suggestionsSection =
    program && program.exercises.length > 0
      ? `\n\n## Suggested next session (computed — cite these numbers, never adjust them; you may explain or disagree with the suggestion in voice, but not the number)\n${renderSuggestedNextSession(suggestNextSession(program, progressionEvents, today))}`
      : "";

  // Same computeNextScheduledSession @vigil/core already gives proactive
  // — only rendered here now, per the same rule core-rules.md already
  // states: never state a future weekday unless it's in a rendered line.
  const nextScheduled = computeNextScheduledSession(profile.training_days as string[], sessions.map((s) => s.date), today);
  const sessionDueToday = nextScheduled.date === today;
  const dueTodayType = sessionDueToday ? programNextSession?.type : undefined;
  const todayStatusLine = sessionDueToday
    ? `A session is due today${dueTodayType ? `: ${dueTodayType}` : ""}.\n`
    : "No session is scheduled today.\n";
  const nextScheduledLine =
    !sessionDueToday && programNextSession
      ? `Next scheduled session: ${nextScheduled.weekday} ${nextScheduled.date} at ${profile.usual_session_time} — ${programNextSession.type} (per current_program.next_session)\n`
      : "";

  // Round 6: which type an excuse is about is never left for the model to
  // infer from "whichever type has the most skips" — see LESSONS.md and
  // core-rules.md's Absence section. Only a rendered "Prior skips" block
  // for the relevant type may be cited as "this happened before."
  const relevantType = determineRelevantSessionType(lastUserMessage, dueTodayType);
  const priorSkipsSection = relevantType
    ? (() => {
        const matches = findMatchingSkips(sessions, relevantType);
        if (matches.length === 0) {
          return `\n\n## Prior ${relevantType} skips on record\nNo prior ${relevantType} skips on record. Do not imply a pattern that isn't here.`;
        }
        // Round 7: "same excuse"/"word for word" is exact string equality,
        // not a judgment call — computed here so the model never has to
        // eyeball whether two semantically-adjacent excuses are identical.
        const exactMatch = findExactSkipMatch(matches, lastUserMessage.trim());
        const matchLine = exactMatch
          ? `Today's excuse text is identical to the skip logged on ${exactMatch.date}.`
          : `Today's excuse text does NOT match any prior ${relevantType} skip verbatim.`;
        return `\n\n## Prior ${relevantType} skips on record (the only skip history you may cite as "this happened before" — verbatim, this type only)\n${matches.map((m) => `- ${m.date} — "${m.excuse}"`).join("\n")}\n${matchLine}`;
      })()
    : `\n\n## Session type check\nNo session type is identifiable from today's message — do not guess or attribute one.`;

  // Milestone 3.5 — always rendered, same as Verified stats, regardless
  // of whether the conversation is about food at all. allEvents already
  // fetches every kind (no `.in()` filter above), so food_logged rows
  // are already present here without a query change.
  const foodEvents: FoodEvent[] = allEvents
    .filter((e) => e.kind === "food_logged")
    .map((e) => ({ occurred_at: e.occurred_at, payload: e.payload as unknown as { text: string; items?: string[] } }));
  const foodLogSection = `\n\n${renderFoodLog(computeFoodStats(foodEvents, today, FOOD_LOG_WINDOW_DAYS))}`;

  const coreRules = CORE_RULES;
  const personalityVoice = PERSONALITY_PROMPTS[personality];

  const digestSection =
    digests && digests.length > 0
      ? `## Coach's impressions (LLM-written summaries — qualitative texture only. If anything here conflicts with Verified stats above on ANY fact, including which session type happened when, Verified stats wins outright and this is not mentioned.)\n${digests
          .map((d) => `- ${d.period_start} to ${d.period_end}: ${d.digest}`)
          .join("\n")}`
      : "";

  const clientFile = `## Client file

Name: ${profile.name}
Goal: ${profile.goal}
Training days: ${(profile.training_days as string[]).join(", ")}
Usual session time: ${profile.usual_session_time}
${todayStatusLine}${nextScheduledLine}
## Verified stats (computed from events — the only numbers you may cite as a count, streak, "X of Y", or "days since" claim)
${verifiedStats}${suggestionsSection}${priorSkipsSection}${foodLogSection}

${digestSection}`;

  const baseSystem = `${coreRules.trim()}\n\n${personalityVoice.trim()}\n\n${clientFile}\n\nToday is ${today}.`;

  // BRIEF-PHASE2.md acceptance test 4: grep the assembled prompt for stray
  // fabricated numbers outside Verified stats. Returns the prompt as-is,
  // no Anthropic call — same auth/RLS as a normal request, since this is
  // entirely the caller's own data reflected back, nothing more exposed
  // than a real reply already implies.
  if (body?.debug === true) {
    return new Response(JSON.stringify({ system: baseSystem }), { headers: { "Content-Type": "application/json" } });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  // Conversational logging (BRIEF-PHASE3.md). Two entry points: a reply
  // to an existing pendingLog, or a fresh message that looks like a set
  // log. Either way, nothing is written to `events` except through the
  // explicit "confirm" branch below — extraction alone never writes.
  let responsePendingLog: PendingLogProposal | undefined;
  let systemNote = "";

  if (pendingLog) {
    const classification = classifyConfirmation(lastUserMessage);

    if (classification === "confirm") {
      const { data: todaysSessions } = await supabase
        .from("events")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", "session_completed")
        .gte("occurred_at", `${today}T00:00:00Z`)
        .lt("occurred_at", `${today}T23:59:59Z`);
      const alreadyLogged = (todaysSessions ?? []).some((e) =>
        payloadsMatch(pendingLog, e.payload as unknown as { type: string; exercises: ExerciseLog[] })
      );

      if (alreadyLogged) {
        systemNote = `\n\nThis exact session (${JSON.stringify(pendingLog)}) was already confirmed and logged earlier — there's nothing new to write. Acknowledge that plainly; don't re-list every number as if it's new, and don't ask what they're confirming.`;
      } else {
        const { error: insertError } = await supabase.from("events").insert({
          user_id: user.id,
          occurred_at: `${today}T12:00:00Z`,
          kind: "session_completed",
          payload: { type: pendingLog.type, exercises: pendingLog.exercises, source: "chat" },
        });
        if (insertError) {
          return new Response(JSON.stringify({ error: `Failed to record session: ${insertError.message}` }), { status: 500 });
        }
        systemNote = `\n\nThe pending log proposal was just confirmed and written to the log: ${JSON.stringify(pendingLog)}. Acknowledge it briefly in voice — you don't need to repeat every number back, just confirm it's logged.`;
      }
    } else if (classification === "deny") {
      systemNote = `\n\nThe athlete rejected the pending log proposal (${JSON.stringify(pendingLog)}) as incorrect. Nothing was written. Ask what's actually correct.`;
    } else {
      const patch = await extractCorrection(anthropic, lastUserMessage, pendingLog);
      const { updated, unclearFields } = applyCorrectionPatch(pendingLog, patch);
      if (updated) {
        responsePendingLog = updated;
        systemNote = `\n\nYou have an updated log proposal after the athlete's correction: ${JSON.stringify(updated)}. Echo it back in voice and ask them to confirm. Do not alter these numbers.`;
      } else {
        responsePendingLog = pendingLog; // stay pending on the original proposal rather than dropping context
        systemNote = `\n\nThe athlete's reply didn't clearly confirm, deny, or correct the pending proposal (${JSON.stringify(pendingLog)}). Ask specifically about: ${unclearFields.join(", ")}. Do not assume or guess.`;
      }
    }
  } else if (looksLikeSetLog(lastUserMessage)) {
    const extraction = await extractSetLog(anthropic, lastUserMessage);
    const gate = applyConfidenceGate(extraction);
    if (gate.pendingLog) {
      responsePendingLog = gate.pendingLog;
      systemNote = `\n\nYou have a new log proposal to confirm: ${JSON.stringify(gate.pendingLog)}. Echo it back in your own voice (e.g. "Logging: bench 4x6 @ 82.5, RPE 8, under Push. Confirm?") and ask for confirmation. Do not alter these numbers.`;
    } else {
      systemNote = `\n\nThe athlete seems to be describing a session, but this is unclear: ${gate.unclearFields.join(", ")}. Ask specifically about those — do not assume or guess at numbers.`;
    }
  }

  // Food logging (Milestone 3.5), independent of the session-logging
  // branch above — a message could in principle touch both, and each
  // gets its own pendingLog slot round-tripping through the client the
  // same way. Simpler than sessions: one text field, not five, so a
  // correction just re-extracts and replaces rather than patching.
  let responsePendingFoodLog: PendingFoodLogProposal | undefined;

  if (pendingFoodLog) {
    const classification = classifyConfirmation(lastUserMessage);

    if (classification === "confirm") {
      const { data: todaysFood } = await supabase
        .from("events")
        .select("payload")
        .eq("user_id", user.id)
        .eq("kind", "food_logged")
        .gte("occurred_at", `${today}T00:00:00Z`)
        .lt("occurred_at", `${today}T23:59:59Z`);
      const alreadyLogged = (todaysFood ?? []).some((e) => foodPayloadsMatch(pendingFoodLog, e.payload as unknown as { text: string }));

      if (alreadyLogged) {
        systemNote += `\n\nThis exact food entry ("${pendingFoodLog.text}") was already confirmed and logged earlier — there's nothing new to write. Acknowledge that plainly, don't ask what they're confirming.`;
      } else {
        const { error: insertError } = await supabase.from("events").insert({
          user_id: user.id,
          occurred_at: `${today}T12:00:00Z`,
          kind: "food_logged",
          payload: { text: pendingFoodLog.text, items: pendingFoodLog.items },
        });
        if (insertError) {
          return new Response(JSON.stringify({ error: `Failed to record food entry: ${insertError.message}` }), { status: 500 });
        }
        systemNote += `\n\nThe pending food entry was just confirmed and written to the log: "${pendingFoodLog.text}". Acknowledge it briefly and neutrally — descriptive, not praise or judgment (see core-rules.md's Food section).`;
      }
    } else if (classification === "deny") {
      systemNote += `\n\nThe athlete rejected the pending food entry ("${pendingFoodLog.text}") as incorrect. Nothing was written. Ask what's actually correct.`;
    } else {
      const reExtraction = await extractFoodLog(anthropic, lastUserMessage);
      if (reExtraction.is_food_log) {
        const updated: PendingFoodLogProposal = { text: lastUserMessage, items: reExtraction.items };
        responsePendingFoodLog = updated;
        systemNote += `\n\nYou have an updated food entry after the athlete's correction: "${updated.text}". Echo it back neutrally and ask them to confirm.`;
      } else {
        responsePendingFoodLog = pendingFoodLog; // stay pending on the original proposal
        systemNote += `\n\nThe athlete's reply didn't clearly confirm, deny, or correct the pending food entry ("${pendingFoodLog.text}"). Ask what they mean, plainly.`;
      }
    }
  } else if (looksLikeFoodLog(lastUserMessage)) {
    const extraction = await extractFoodLog(anthropic, lastUserMessage);
    if (extraction.is_food_log) {
      const proposal: PendingFoodLogProposal = { text: lastUserMessage, items: extraction.items };
      responsePendingFoodLog = proposal;
      systemNote += `\n\nYou have a new food entry to confirm: "${proposal.text}". Echo it back neutrally (e.g. "Logging: chicken and rice. Confirm?") and ask for confirmation. Descriptive only — no judgment, no praise, no nutritional estimate (see core-rules.md's Food section).`;
    }
    // If extraction says this isn't actually a food log (a question, a
    // hypothetical), no pendingFoodLog is created and no note is added —
    // it's just ordinary conversation, exactly as core-rules.md's Food
    // section and the "never raise unprompted" rule both expect.
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: baseSystem + systemNote,
    messages: messages.slice(-30).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  });

  const reply = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return new Response(JSON.stringify({ reply, pendingLog: responsePendingLog, pendingFoodLog: responsePendingFoodLog }), {
    headers: { "Content-Type": "application/json" },
  });
});
