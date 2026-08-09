import fs from "node:fs";
import path from "node:path";
import { computeSessionStats, renderVerifiedStats, resolvePersonality, weekdayOfDateString } from "@vigil/core";
import type { CoreSession } from "@vigil/core";

const REPO_ROOT = path.resolve(process.cwd(), "..");

interface RecentSession {
  date: string;
  type: string;
  status: string;
  highlight?: string;
  excuse_given?: string;
}

interface Excuse {
  date: string;
  excuse: string;
}

interface Profile {
  client: {
    name: string;
    age: number;
    goal: string;
    training_days: string[];
    usual_session_time: string;
    injuries: string[];
    current_stats: { weight_kg: number; bench_1rm_kg: number; squat_1rm_kg: number };
  };
  current_program: {
    name: string;
    next_session: { type: string; planned: string[] };
  };
  recent_sessions: RecentSession[];
  excuse_log: Excuse[];
  streak: { current_weeks_3_of_3_sessions: number; best_weeks_3_of_3_sessions: number };
}

// computeSessionStats/renderVerifiedStats used to be defined here (and
// independently again in proactive/state.ts, with an incompatible shape and
// an implicit-vs-explicit timezone inconsistency in the weekday helper each
// surface paired it with). Both now import the single implementation in
// @vigil/core, which speaks a shared "completed"/"skipped" shape — this
// adapter is the thin translation from fake-profile.json's "SKIPPED"/
// excuse_given shape, not a second implementation of the stats logic.
function toCoreSessions(sessions: RecentSession[]): CoreSession[] {
  return sessions.map((s) => ({
    date: s.date,
    type: s.type,
    status: s.status === "SKIPPED" ? "skipped" : "completed",
    excuse: s.excuse_given,
  }));
}

function renderProfile(profile: Profile, today: string): string {
  const c = profile.client;
  const prog = profile.current_program;

  const sessions = profile.recent_sessions
    .map((s) => {
      const detail = s.status === "SKIPPED" ? `SKIPPED — excuse: "${s.excuse_given}"` : `completed — ${s.highlight}`;
      return `- ${s.date} (${weekdayOfDateString(s.date)}) ${s.type}: ${detail}`;
    })
    .join("\n");

  const excuses = profile.excuse_log.map((e) => `- ${e.date}: "${e.excuse}"`).join("\n");
  // fake-profile.json's current_stats is a dateless "as of now" snapshot,
  // not a dated weigh-in log — rendered below same as always, but it can't
  // honestly feed the dated Verified-stats weight line, so that renders
  // "none logged yet" until real dated weigh-ins exist (Phase 2).
  const verifiedStats = renderVerifiedStats(computeSessionStats(toCoreSessions(profile.recent_sessions), today), null);
  const planned = prog.next_session.planned.map((p) => `- ${p}`).join("\n");

  return `## Client file

Name: ${c.name}, Age: ${c.age}
Goal: ${c.goal}
Training days: ${c.training_days.join(", ")}
Usual session time: ${c.usual_session_time}
Injuries: ${c.injuries.join("; ")}
Current stats: bodyweight ${c.current_stats.weight_kg}kg, bench 1RM ${c.current_stats.bench_1rm_kg}kg, squat 1RM ${c.current_stats.squat_1rm_kg}kg

Current program: ${prog.name}
Next session (${prog.next_session.type}):
${planned}

Recent sessions (most recent first):
${sessions}

Excuse log:
${excuses}

## Verified stats (computed from recent_sessions — the only numbers you may cite as a count, streak, or "X of Y" claim; do not derive or estimate beyond these)
${verifiedStats}

Streak: currently ${profile.streak.current_weeks_3_of_3_sessions} weeks of 3/3 sessions hit in a row; best streak ${profile.streak.best_weeks_3_of_3_sessions} weeks.`;
}

export function buildSystemPrompt(personality?: string): string {
  const coreRules = fs.readFileSync(path.join(REPO_ROOT, "coach-prompts", "core-rules.md"), "utf-8").trim();
  const voice = fs
    .readFileSync(path.join(REPO_ROOT, "coach-prompts", "personalities", `${resolvePersonality(personality)}.md`), "utf-8")
    .trim();
  const profile: Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "fake-profile.json"), "utf-8"));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const clientFile = renderProfile(profile, today);
  const dateLine = `Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

  return `${coreRules}\n\n${voice}\n\n${clientFile}\n\n${dateLine}`;
}
