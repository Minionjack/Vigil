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
  patterns_noted: string[];
  streak: { current_weeks_3_of_3_sessions: number; best_weeks_3_of_3_sessions: number };
}

function dayOfWeek(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
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
  const patterns = profile.patterns_noted.map((p) => `- ${p}`).join("\n");
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

Patterns noted:
${patterns}

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
