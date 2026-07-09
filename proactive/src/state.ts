import fs from "node:fs";
import { addDays, weekdayOfDateString } from "./rules.js";
import type { Session, State } from "./types.js";

export function loadState(path: string): State {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

export function saveState(path: string, state: State): void {
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

export interface TypeStats {
  completed: number;
  skipped: number;
  skipEntries: { date: string; excuse: string }[];
}

/**
 * Same principle as server/systemPrompt.ts's computed stats: the only
 * numbers a generated message may cite as a count, streak, or "X of Y"
 * claim. Prevents inventing a plateau or trend for a session type with zero
 * completed entries.
 */
export function computeSessionStats(sessions: Session[]): Record<string, TypeStats> {
  const stats: Record<string, TypeStats> = {};
  for (const s of sessions) {
    if (!stats[s.type]) stats[s.type] = { completed: 0, skipped: 0, skipEntries: [] };
    if (s.status === "skipped") {
      stats[s.type].skipped += 1;
      stats[s.type].skipEntries.push({ date: s.date, excuse: s.excuse ?? "no excuse given" });
    } else {
      stats[s.type].completed += 1;
    }
  }
  return stats;
}

export interface NextScheduledSession {
  date: string; // YYYY-MM-DD
  weekday: string;
}

/**
 * The next day the client is due to train, per client.training_days —
 * today counts if it's a training day and nothing's logged for it yet.
 * Computed here (not left for the model to infer from the weekday pattern
 * on past sessions) so a future session's date/weekday is always a
 * rendered fact, never a guess — see the "Next scheduled session" line in
 * renderState and the matching never-derive rule in proactive-extension.md.
 */
export function computeNextScheduledSession(state: State, today: string): NextScheduledSession {
  for (let offset = 0; offset < 7; offset++) {
    const date = offset === 0 ? today : addDays(today, offset);
    const weekday = weekdayOfDateString(date);
    if (!state.client.training_days.includes(weekday)) continue;
    if (offset === 0 && state.sessions.some((s) => s.date === date)) continue;
    return { date, weekday };
  }
  throw new Error("No training days configured in state.client.training_days");
}

export function renderVerifiedStats(stats: Record<string, TypeStats>): string {
  return Object.entries(stats)
    .map(([type, s]) => {
      if (s.completed === 0 && s.skipped > 0) {
        const dates = s.skipEntries.map((e) => `${e.date} ("${e.excuse}")`).join(", ");
        return `- ${type}: 0 completed, ${s.skipped} skipped in logged history (${dates}). No ${type.toLowerCase()} performance data exists — never reference progress, plateaus, or numbers for this type; state plainly that none has been logged.`;
      }
      const skipNote = s.skipped > 0 ? `${s.skipped} skipped` : "never skipped";
      return `- ${type}: ${s.completed} completed, ${skipNote}, in logged history.`;
    })
    .join("\n");
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

  const verifiedStats = renderVerifiedStats(computeSessionStats(state.sessions));
  const planned = prog.next_session.planned.map((p) => `- ${p}`).join("\n");
  const next = computeNextScheduledSession(state, today);
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
${verifiedStats || "(no sessions logged yet)"}`;
}
