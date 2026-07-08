import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSessionStats, renderState, renderVerifiedStats } from "./state.js";
import type { Session, State } from "./types.js";

test("computeSessionStats counts completed and skipped per type", () => {
  const sessions: Session[] = [
    { date: "2026-07-13", type: "Push", status: "completed", note: "bench" },
    { date: "2026-07-08", type: "Pull", status: "completed", note: "rows" },
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired after work" },
    { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work is crazy this week" },
  ];

  const stats = computeSessionStats(sessions);

  assert.equal(stats["Legs"].completed, 0);
  assert.equal(stats["Legs"].skipped, 2);
  assert.equal(stats["Pull"].completed, 1);
  assert.equal(stats["Pull"].skipped, 0);
});

test("renderVerifiedStats flags a zero-completed type and forbids inferred trends", () => {
  const stats = computeSessionStats([
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired" },
    { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "busy" },
  ]);

  const rendered = renderVerifiedStats(stats);
  assert.match(rendered, /0 completed, 2 skipped/);
  assert.match(rendered, /No legs performance data exists/);
});

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
