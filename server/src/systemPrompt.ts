import fs from "node:fs";
import path from "node:path";

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

export interface TypeStats {
  completed: number;
  skipped: number;
  skipEntries: { date: string; excuse: string }[];
}

function dayOfWeek(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Derives per-session-type counts straight from recent_sessions — the only
 * numbers Claude is allowed to cite as a count, streak, or "X of Y" claim.
 * Hand-authored pattern text (the old `patterns_noted` field) previously let
 * the model repeat claims — like a squat plateau with zero logged squat
 * sessions to support it — that weren't actually backed by the data.
 */
export function computeSessionStats(sessions: RecentSession[]): Record<string, TypeStats> {
  const stats: Record<string, TypeStats> = {};
  for (const s of sessions) {
    const key = s.type;
    if (!stats[key]) stats[key] = { completed: 0, skipped: 0, skipEntries: [] };
    if (s.status === "SKIPPED") {
      stats[key].skipped += 1;
      stats[key].skipEntries.push({ date: s.date, excuse: s.excuse_given ?? "no excuse given" });
    } else {
      stats[key].completed += 1;
    }
  }
  return stats;
}

export function renderVerifiedStats(stats: Record<string, TypeStats>): string {
  return Object.entries(stats)
    .map(([type, s]) => {
      if (s.completed === 0 && s.skipped > 0) {
        const dates = s.skipEntries.map((e) => `${e.date} ("${e.excuse}")`).join(", ");
        return `- ${type}: 0 completed, ${s.skipped} skipped in logged history (${dates}). No ${type.toLowerCase()} performance data exists in this file — never reference progress, plateaus, or numbers for this session type; state plainly that none has been logged.`;
      }
      const skipNote = s.skipped > 0 ? `${s.skipped} skipped` : "never skipped";
      return `- ${type}: ${s.completed} completed, ${skipNote}, in logged history.`;
    })
    .join("\n");
}

function renderProfile(profile: Profile): string {
  const c = profile.client;
  const prog = profile.current_program;

  const sessions = profile.recent_sessions
    .map((s) => {
      const detail = s.status === "SKIPPED" ? `SKIPPED — excuse: "${s.excuse_given}"` : `completed — ${s.highlight}`;
      return `- ${s.date} (${dayOfWeek(s.date)}) ${s.type}: ${detail}`;
    })
    .join("\n");

  const excuses = profile.excuse_log.map((e) => `- ${e.date}: "${e.excuse}"`).join("\n");
  const verifiedStats = renderVerifiedStats(computeSessionStats(profile.recent_sessions));
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

export function buildSystemPrompt(): string {
  const personality = fs.readFileSync(path.join(REPO_ROOT, "coach-prompts", "drill-sergeant.md"), "utf-8").trim();
  const profile: Profile = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "fake-profile.json"), "utf-8"));
  const clientFile = renderProfile(profile);

  const now = new Date();
  const dateLine = `Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

  return `${personality}\n\n${clientFile}\n\n${dateLine}`;
}
