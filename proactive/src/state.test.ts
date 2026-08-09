import assert from "node:assert/strict";
import { test } from "node:test";
import { renderState } from "./state.js";
import type { State } from "./types.js";

// computeSessionStats, renderVerifiedStats, and computeNextScheduledSession
// now live in packages/core — their unit tests moved with them. What's left
// here is renderState's own integration behavior: that it wires the shared
// helpers together correctly for this surface.

test("renderState labels each session with its actual weekday, not left for the model to guess", () => {
  const state: State = {
    client: {
      name: "Jack",
      goal: "test goal",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30",
      timezone: "Asia/Dubai",
    },
    current_program: { name: "test", next_session: { type: "Push", planned: ["Bench"] } },
    // 2026-07-06 is a Monday, not a Friday — this is the regression this test guards against.
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "Bench 4x6 @ 80kg" }],
    journal_config: { max_messages_per_day: 2, quiet_hours: { before: "06:30", after: "21:30" }, delivery: { method: "ntfy", topic: "t" } },
  };

  const rendered = renderState(state, "2026-07-13");
  assert.match(rendered, /2026-07-06 \(Monday\) Push/);
  assert.doesNotMatch(rendered, /2026-07-06 \(Friday\)/);
});

test("renderState states weight as 'none logged yet' — the proactive stub has no weight source yet", () => {
  const state: State = {
    client: {
      name: "Jack",
      goal: "test goal",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30",
      timezone: "Asia/Dubai",
    },
    current_program: { name: "test", next_session: { type: "Push", planned: ["Bench"] } },
    sessions: [],
    journal_config: { max_messages_per_day: 2, quiet_hours: { before: "06:30", after: "21:30" }, delivery: { method: "ntfy", topic: "t" } },
  };

  const rendered = renderState(state, "2026-07-13");
  assert.match(rendered, /Weight: none logged yet/);
});
