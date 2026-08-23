import { test, expect } from "vitest";
import { computeAcknowledgment, evaluateRules } from "./rules.js";
import type { FiredLogEntry, State } from "./types.js";

function baseState(overrides: Partial<State> = {}): State {
  return {
    client: {
      name: "Jack",
      goal: "Lose 8 kg by 30 September 2026 and bench 100 kg",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30",
      timezone: "UTC",
    },
    current_program: {
      name: "Push/Pull/Legs — Week 5 of 8",
      next_session: {
        type: "Push",
        planned: ["Bench 4x6 @ 82.5kg"],
        fallback_30min: ["Bench 4x6"],
      },
    },
    sessions: [],
    journal_config: {
      max_messages_per_day: 2,
      quiet_hours: { before: "06:30", after: "21:30" },
      delivery: { method: "ntfy", topic: "test-topic" },
    },
    ...overrides,
  };
}

// 2026-07-06 is a Monday (a training day in the default fixture).
test("R1 fires within the nudge window on a training day with nothing logged", () => {
  const state = baseState();
  const now = new Date("2026-07-06T17:50:00Z"); // 45 min before 18:30
  const result = evaluateRules(state, now, []);
  expect(result?.rule).toBe("R1");
});

test("R1 does not fire before the nudge window opens", () => {
  const state = baseState();
  const now = new Date("2026-07-06T10:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result).toBe(null);
});

test("R1 does not fire twice in the same day", () => {
  const state = baseState();
  const now = new Date("2026-07-06T19:00:00Z");
  const firedLog: FiredLogEntry[] = [{ date: "2026-07-06", rule: "R1" }];
  const result = evaluateRules(state, now, firedLog);
  expect(result).toBe(null);
});

test("R1 does not fire once today's session is logged", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "done" }],
  });
  const now = new Date("2026-07-06T19:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result).toBe(null);
});

// 2026-07-07 is a Tuesday; 2026-07-06 (Monday) was the training day with nothing logged.
test("R2 fires the morning after a training day with no session logged", () => {
  const state = baseState();
  const now = new Date("2026-07-07T07:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result?.rule).toBe("R2");
});

test("R2 does not fire if yesterday's session was logged (even as skipped)", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "skipped", excuse: "busy" }],
  });
  const now = new Date("2026-07-07T07:00:00Z");
  const result = evaluateRules(state, now, []);
  // Falls through to R1 evaluation for today (Tuesday, not a training day) -> null.
  expect(result).toBe(null);
});

test("R2 takes priority over R1 when both are eligible on the same tick", () => {
  // Back-to-back training days so today's nudge window (R1) and yesterday's
  // no-show (R2) can genuinely both be true at once.
  const state = baseState({ client: { ...baseState().client, training_days: ["Monday", "Tuesday"] } });
  const now = new Date("2026-07-07T17:50:00Z"); // Tuesday, within the nudge window; Monday also unlogged
  const result = evaluateRules(state, now, []);
  expect(result?.rule).toBe("R2");
});

test("R3 fires when the same session type is skipped twice in trailing 21 days", () => {
  const state = baseState({
    sessions: [
      { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work" },
      { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "tired" },
      { date: "2026-07-06", type: "Push", status: "completed", note: "ok" },
    ],
  });
  // Wednesday, but not the pre-session window and yesterday wasn't a training
  // day miss, so only R3 should be eligible.
  const now = new Date("2026-07-08T10:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result?.rule).toBe("R3");
  expect(result?.patternType).toBe("Legs");
});

test("R3 does not fire twice in the same week", () => {
  const state = baseState({
    sessions: [
      { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work" },
      { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "tired" },
    ],
  });
  const now = new Date("2026-07-08T10:00:00Z");
  const firedLog: FiredLogEntry[] = [{ date: "2026-07-06", rule: "R3" }]; // same week (Mon 07-06)
  const result = evaluateRules(state, now, firedLog);
  expect(result).toBe(null);
});

test("R4 fires on the last scheduled training day when the week is short", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "ok" }], // 1 of 3
  });
  // Friday 07-10 is the last training day (Mon/Wed/Fri), outside R1's window and not a fresh no-show morning.
  const now = new Date("2026-07-10T10:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result?.rule).toBe("R4");
});

test("R4 does not fire once the week's quota is already met", () => {
  const state = baseState({
    sessions: [
      { date: "2026-07-06", type: "Push", status: "completed", note: "ok" },
      { date: "2026-07-08", type: "Pull", status: "completed", note: "ok" },
      { date: "2026-07-09", type: "Legs", status: "completed", note: "ok" },
    ],
  });
  const now = new Date("2026-07-10T10:00:00Z");
  const result = evaluateRules(state, now, []);
  expect(result).toBe(null);
});

test("hard cap: no rule fires once max_messages_per_day is reached", () => {
  const state = baseState();
  const now = new Date("2026-07-06T17:50:00Z");
  const firedLog: FiredLogEntry[] = [
    { date: "2026-07-06", rule: "R3" },
    { date: "2026-07-06", rule: "R4" },
  ];
  const result = evaluateRules(state, now, firedLog);
  expect(result).toBe(null);
});

test("quiet hours: nothing fires outside the allowed window", () => {
  const state = baseState();
  const now = new Date("2026-07-06T22:00:00Z"); // after 21:30
  const result = evaluateRules(state, now, []);
  expect(result).toBe(null);
});

test("R5: acknowledges a completed session that followed an R1 nudge", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "done after nudge" }],
  });
  const firedLog: FiredLogEntry[] = [{ date: "2026-07-06", rule: "R1" }];
  const ack = computeAcknowledgment(state, firedLog);
  expect(ack).toEqual({ date: "2026-07-06", type: "Push" });
});

test("R5: does not re-acknowledge once a later message has already gone out", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "done after nudge" }],
  });
  const firedLog: FiredLogEntry[] = [
    { date: "2026-07-06", rule: "R1" },
    { date: "2026-07-08", rule: "R1" },
  ];
  const ack = computeAcknowledgment(state, firedLog);
  expect(ack).toBe(null);
});

test("R5: no acknowledgment when the nudged session was never completed", () => {
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "skipped", excuse: "busy" }],
  });
  const firedLog: FiredLogEntry[] = [{ date: "2026-07-06", rule: "R1" }];
  const ack = computeAcknowledgment(state, firedLog);
  expect(ack).toBe(null);
});
