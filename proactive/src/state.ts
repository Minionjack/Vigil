import fs from "node:fs";
import type { State } from "./types.js";

export function loadState(path: string): State {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

export function saveState(path: string, state: State): void {
  fs.writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

export function renderState(state: State, today: string): string {
  const c = state.client;
  const prog = state.current_program;

  const sessions = [...state.sessions]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => {
      const detail = s.status === "skipped" ? `SKIPPED — excuse: "${s.excuse ?? "none given"}"` : `completed — ${s.note ?? ""}`;
      return `- ${s.date} ${s.type}: ${detail}`;
    })
    .join("\n");

  const planned = prog.next_session.planned.map((p) => `- ${p}`).join("\n");

  return `## Client file

Name: ${c.name}
Goal: ${c.goal}
Training days: ${c.training_days.join(", ")}
Usual session time: ${c.usual_session_time}
Today: ${today}

Current program: ${prog.name}
Next session (${prog.next_session.type}):
${planned}

Recent sessions (most recent first):
${sessions || "(none logged)"}`;
}
