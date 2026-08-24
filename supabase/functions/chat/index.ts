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
// Same contract as server/src/index.ts's /chat route: { messages, personality }
// in, { reply } out. Personality/profile/digest assembly now reads from
// Postgres instead of fake-profile.json / state.json.

import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  computeSessionStats,
  renderVerifiedStats,
  type CoreSession,
  type WeightEntry,
} from "../_shared/core/stats.ts";
import { resolvePersonality } from "../_shared/core/personality.ts";
import { CORE_RULES, PERSONALITY_PROMPTS } from "../_shared/prompts.ts";

const MODEL = "claude-sonnet-4-6";

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

function latestWeight(events: EventRow[]): WeightEntry | null {
  const weighIns = events.filter((e) => e.kind === "weight_logged").sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  if (weighIns.length === 0) return null;
  return { date: weighIns[0].occurred_at.slice(0, 10), weight_kg: Number(weighIns[0].payload.weight_kg) };
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

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "Request body must include a non-empty `messages` array." }), { status: 400 });
  }

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
  const sessions = eventsToSessions(events ?? []);
  const verifiedStats = renderVerifiedStats(computeSessionStats(sessions, today), latestWeight(events ?? []));

  const coreRules = CORE_RULES;
  const personalityVoice = PERSONALITY_PROMPTS[personality];

  const digestSection =
    digests && digests.length > 0
      ? `## Coach's impressions (LLM-written summaries — cite themes, never numbers; all numbers come from Verified stats above)\n${digests
          .map((d) => `- ${d.period_start} to ${d.period_end}: ${d.digest}`)
          .join("\n")}`
      : "";

  const clientFile = `## Client file

Name: ${profile.name}
Goal: ${profile.goal}
Training days: ${(profile.training_days as string[]).join(", ")}
Usual session time: ${profile.usual_session_time}

## Verified stats (computed from events — the only numbers you may cite as a count, streak, "X of Y", or "days since" claim)
${verifiedStats}

${digestSection}`;

  const system = `${coreRules.trim()}\n\n${personalityVoice.trim()}\n\n${clientFile}\n\nToday is ${today}.`;

  // BRIEF-PHASE2.md acceptance test 4: grep the assembled prompt for stray
  // fabricated numbers outside Verified stats. Returns the prompt as-is,
  // no Anthropic call — same auth/RLS as a normal request, since this is
  // entirely the caller's own data reflected back, nothing more exposed
  // than a real reply already implies.
  if (body?.debug === true) {
    return new Response(JSON.stringify({ system }), { headers: { "Content-Type": "application/json" } });
  }

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: messages.slice(-30).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
  });

  const reply = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return new Response(JSON.stringify({ reply }), { headers: { "Content-Type": "application/json" } });
});
