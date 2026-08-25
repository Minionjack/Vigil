// Supabase Edge Function — proactive-check
//
// Phase 4, item 1: the rules engine moved off the laptop's local cron job
// and into the cloud, triggered by pg_cron every 15 minutes (see
// supabase/migrations/0003_pg_cron.sql). Deployed with --no-verify-jwt —
// a pg_cron-triggered request has no user session to verify, same
// unauthenticated-trigger shape nightly-digest already anticipated in its
// own header comment. Uses SUPABASE_SERVICE_ROLE_KEY internally and loops
// over every profile, same pattern nightly-digest already established.
//
// Delivery stays ntfy for now (real push is gated on the Apple Developer
// account — see BRIEF-PHASE4.md's own header). What's real here: the
// rules engine itself, and — for the first time — actual `nudge_fired`
// events. Previously every fire only appended to a local, gitignored
// journal.jsonl, which is exactly what breaks in a stateless cloud
// function with no persistent disk. The de-dup/cap logic now reads its
// history from Postgres, which is what makes "the journal IS the event
// log now" (BRIEF-PHASE2.md) literally true instead of aspirational.
//
// Deliberately does not write nudge_outcome events or build act-rate
// instrumentation — analytics on top of correct firing, not required for
// evaluateRules/computeAcknowledgment, which only ever read `sessions`
// and the fired-rule history, never outcome events.

import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { evaluateRules, computeAcknowledgment, type RulesState, type FiredLogEntry } from "../_shared/core/rules.ts";
import { computeSessionStats, renderVerifiedStats, type CoreSession } from "../_shared/core/stats.ts";
import { computeNextScheduledSession } from "../_shared/core/nextSession.ts";
import { suggestNextSession, renderSuggestedNextSession, type Program, type ProgressionEvent } from "../_shared/core/progression.ts";
import { dateStringInTz, weekdayOfDateString } from "../_shared/core/dateTz.ts";
import { resolvePersonality } from "../_shared/core/personality.ts";
import { CORE_RULES, PERSONALITY_PROMPTS, PROACTIVE_EXTENSION } from "../_shared/prompts.ts";

const MODEL = "claude-sonnet-4-6";

// Mirrors proactive/local-config.json's journal_config exactly. Not
// migrated into Postgres this pass — genuinely single-user today, and a
// per-user config table is real scope this port isn't taking on (flagged
// in the Phase 4 item-1 plan, not a silent omission).
const JOURNAL_CONFIG = {
  max_messages_per_day: 2,
  quiet_hours: { before: "06:30", after: "21:30" },
  delivery: { topic: "vigil-jk-2590a02f" },
};

interface EventRow {
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
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

async function deliverNtfy(topic: string, message: string): Promise<void> {
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    body: message,
    headers: { Title: "SGT VIGIL" },
  });
  if (!res.ok) {
    throw new Error(`ntfy delivery failed: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  // Optional time override for manual/testing invocations only — pg_cron's
  // real POST body is always {}. Same debug-hook precedent chat/index.ts
  // already sets (its `debug: true` flag); the only thing an override here
  // can do is trigger a real, rule-gated nudge outside quiet hours, not
  // expose or corrupt anything.
  const body = await req.json().catch(() => ({}));
  const now = body?.now ? new Date(body.now) : new Date();

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("*");
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
  }

  const results: { user_id: string; fired: string | null }[] = [];

  for (const profile of profiles ?? []) {
    const userId = profile.user_id as string;

    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("occurred_at, kind, payload")
      .eq("user_id", userId)
      .in("kind", ["session_completed", "session_skipped", "override", "program_changed", "nudge_fired"])
      .order("occurred_at", { ascending: false });

    if (eventsError) {
      results.push({ user_id: userId, fired: null });
      continue;
    }

    const allEvents = (events ?? []) as EventRow[];
    const tz = profile.timezone as string;
    const today = dateStringInTz(now, tz);

    const sessions = eventsToSessions(allEvents);
    const firedLog: FiredLogEntry[] = allEvents
      .filter((e) => e.kind === "nudge_fired")
      .map((e) => ({ date: dateStringInTz(new Date(e.occurred_at), tz), rule: e.payload.rule as FiredLogEntry["rule"] }));

    const rulesState: RulesState = {
      client: {
        training_days: profile.training_days as string[],
        timezone: tz,
        usual_session_time: String(profile.usual_session_time).slice(0, 5),
      },
      sessions: sessions.map((s) => ({ date: s.date, status: s.status, type: s.type })),
      journal_config: JOURNAL_CONFIG,
    };

    const fired = evaluateRules(rulesState, now, firedLog);
    if (!fired) {
      results.push({ user_id: userId, fired: null });
      continue;
    }

    const ack = computeAcknowledgment(rulesState, firedLog);

    // Same "Client file" ingredients chat/index.ts already assembles for
    // this user, built fresh here rather than vendoring proactive's own
    // renderState — that function is tied to proactive's richer State
    // shape (current_program, journal_config) for a CLI-only concern;
    // this only needs what the outbound-message prompt actually reads.
    const programEvent = allEvents.find((e) => e.kind === "program_changed");
    const program = programEvent ? (programEvent.payload as unknown as Program) : null;
    const programNextSession = programEvent ? (programEvent.payload as { next_session?: { type: string; planned?: string[] } }).next_session : undefined;
    const progressionEvents: ProgressionEvent[] = allEvents
      .filter((e) => e.kind === "session_completed" || e.kind === "override")
      .map((e) => ({ occurred_at: e.occurred_at, kind: e.kind as "session_completed" | "override", payload: e.payload }));
    const suggestionsSection =
      program && program.exercises.length > 0
        ? `\n\n## Suggested next session (computed — cite these numbers, never adjust them; you may explain or disagree with the suggestion in voice, but not the number)\n${renderSuggestedNextSession(suggestNextSession(program, progressionEvents, today))}`
        : "";

    const nextScheduled = computeNextScheduledSession(profile.training_days as string[], sessions.map((s) => s.date), today);
    const nextLine = programNextSession
      ? `Next scheduled session: ${nextScheduled.weekday} ${nextScheduled.date} at ${profile.usual_session_time} — ${programNextSession.type} (per current_program.next_session)`
      : "";

    const recentSessions = [...sessions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((s) => `- ${s.date} (${weekdayOfDateString(s.date)}) ${s.type}: ${s.status === "skipped" ? `SKIPPED — excuse: "${s.excuse ?? "none given"}"` : "completed"}`)
      .join("\n");

    const clientFile = `## Client file

Name: ${profile.name}
Goal: ${profile.goal}
Training days: ${(profile.training_days as string[]).join(", ")}
Usual session time: ${profile.usual_session_time}
Today: ${today}
${nextLine}

Recent sessions (most recent first):
${recentSessions || "(none logged)"}

## Verified stats (computed — the only numbers you may cite as a count, streak, or "X of Y" claim; do not derive or estimate beyond these)
${renderVerifiedStats(computeSessionStats(sessions, today), null)}${suggestionsSection}`;

    const ruleLine = `## Rule fired: ${fired.rule}\nReason: ${fired.reason}`;
    const ackLine = ack
      ? `\n\nBefore anything else, acknowledge in one short line that the ${ack.type} session on ${ack.date} got done — you nudged him into it. Then continue with this message's own point.`
      : "";

    const personalityVoice = PERSONALITY_PROMPTS[resolvePersonality(profile.personality)];
    const system = `${CORE_RULES.trim()}\n\n${personalityVoice.trim()}\n\n${PROACTIVE_EXTENSION.trim()}\n\n${clientFile}\n\n${ruleLine}${ackLine}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      system,
      messages: [{ role: "user", content: "Generate the outbound message now." }],
    });
    const message = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    await deliverNtfy(JOURNAL_CONFIG.delivery.topic, message);

    const { error: insertError } = await supabase.from("events").insert({
      user_id: userId,
      occurred_at: now.toISOString(),
      kind: "nudge_fired",
      payload: { rule: fired.rule, reason: fired.reason, message },
    });
    if (insertError) {
      results.push({ user_id: userId, fired: `${fired.rule} (delivered, event insert failed: ${insertError.message})` });
      continue;
    }

    results.push({ user_id: userId, fired: fired.rule });
  }

  return new Response(JSON.stringify({ now: now.toISOString(), results }), { headers: { "Content-Type": "application/json" } });
});
