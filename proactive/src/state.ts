import fs from "node:fs";
import { computeNextScheduledSession, computeSessionStats, renderVerifiedStats, weekdayOfDateString } from "@vigil/core";
import type { State } from "./types.js";

// computeSessionStats, renderVerifiedStats, and computeNextScheduledSession
// used to be defined here (and independently again in server/systemPrompt.ts,
// with an incompatible shape and a timezone inconsistency between the two).
// Both now import the single implementation in @vigil/core.

export function loadState(path: string): State {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

export function renderState(state: State, today: string): string {
  const c = state.client;
  const prog = state.current_program;

  const sessions = [...state.sessions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => {
      const detail = s.status === "skipped" ? `SKIPPED — excuse: "${s.excuse ?? "none given"}"` : `completed — ${s.note ?? ""}`;
      return `- ${s.date} (${weekdayOfDateString(s.date)}) ${s.type}: ${detail}`;
    })
    .join("\n");

  // No weight tracking exists in the proactive stub's State yet — that
  // arrives with Phase 2's weight_logged event; null renders the honest
  // "none logged yet" line rather than omitting weight from Verified stats.
  const verifiedStats = renderVerifiedStats(computeSessionStats(state.sessions, today), null);
  const planned = prog.next_session.planned.map((p) => `- ${p}`).join("\n");
  const next = computeNextScheduledSession(
    c.training_days,
    state.sessions.map((s) => s.date),
    today
  );
  // next_session.type is hand-maintained (known drift risk) — render it as-is
  // alongside the computed date/weekday; do not try to reconcile the two here.
  const nextLine = `Next scheduled session: ${next.weekday} ${next.date} at ${c.usual_session_time} — ${prog.next_session.type} (per current_program.next_session)`;

  return `## Client file

Name: ${c.name}
Goal: ${c.goal}
Training days: ${c.training_days.join(", ")}
Usual session time: ${c.usual_session_time}
Today: ${today}
${nextLine}

Current program: ${prog.name}
Next session (${prog.next_session.type}):
${planned}

Recent sessions (most recent first):
${sessions || "(none logged)"}

## Verified stats (computed — the only numbers you may cite as a count, streak, or "X of Y" claim; do not derive or estimate beyond these)
${verifiedStats}`;
}
