import assert from "node:assert/strict";
import { test } from "node:test";
import { runCheck } from "./check.js";
import type { CheckDeps } from "./check.js";
import type { FiredLogEntry, State } from "./types.js";

// Orchestration tests for the actual cron entrypoint's decision path —
// the highest-risk untested file per the architecture-hardening audit.
// Real network (Claude, ntfy) and real filesystem (journal.jsonl) are
// replaced with fakes that record calls, so these test the wiring
// (does a fired rule actually reach delivery and journaling, in what
// order, with what arguments) without touching either.

function baseState(overrides: Partial<State> = {}): State {
  return {
    client: {
      name: "Jack",
      goal: "test goal",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30",
      timezone: "UTC",
    },
    current_program: {
      name: "test",
      next_session: { type: "Push", planned: ["Bench 4x6"] },
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

function fakeDeps(): CheckDeps & { calls: { generateMessage: unknown[]; deliverNtfy: unknown[]; appendJournal: unknown[] } } {
  const calls = { generateMessage: [] as unknown[], deliverNtfy: [] as unknown[], appendJournal: [] as unknown[] };
  return {
    calls,
    generateMessage: async (state, now, fired, ack) => {
      calls.generateMessage.push({ fired, ack });
      return "a fake generated message";
    },
    deliverNtfy: async (topic, message) => {
      calls.deliverNtfy.push({ topic, message });
    },
    appendJournal: (journalPath, entry) => {
      calls.appendJournal.push({ journalPath, entry });
    },
  };
}

test("runCheck: no rule fired means no generation, no delivery, no journaling", async () => {
  // Tuesday, not a training day, and Monday's session is already logged —
  // so neither R1 (wrong day) nor R2 (yesterday wasn't a no-show) apply,
  // and there's no skip pattern or end-of-week shortfall for R3/R4 either.
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "done" }],
  });
  const now = new Date("2026-07-07T12:00:00Z");
  const deps = fakeDeps();

  const result = await runCheck(state, now, [], "/fake/journal.jsonl", false, deps);

  assert.equal(result.fired, null);
  assert.equal(result.delivered, false);
  assert.equal(result.journaled, false);
  assert.equal(deps.calls.generateMessage.length, 0);
  assert.equal(deps.calls.deliverNtfy.length, 0);
  assert.equal(deps.calls.appendJournal.length, 0);
});

test("runCheck: dry run generates the message but never delivers or journals", async () => {
  const state = baseState();
  const now = new Date("2026-07-06T17:50:00Z"); // Monday, within R1's nudge window
  const deps = fakeDeps();

  const result = await runCheck(state, now, [], "/fake/journal.jsonl", true, deps);

  assert.equal(result.fired?.rule, "R1");
  assert.equal(result.message, "a fake generated message");
  assert.equal(result.delivered, false);
  assert.equal(result.journaled, false);
  assert.equal(deps.calls.generateMessage.length, 1);
  assert.equal(deps.calls.deliverNtfy.length, 0);
  assert.equal(deps.calls.appendJournal.length, 0);
});

test("runCheck: a real (non-dry-run) fire delivers then journals, in that order, with the generated message", async () => {
  const state = baseState();
  const now = new Date("2026-07-06T17:50:00Z");
  const deps = fakeDeps();

  const result = await runCheck(state, now, [], "/fake/journal.jsonl", false, deps);

  assert.equal(result.delivered, true);
  assert.equal(result.journaled, true);
  assert.equal(deps.calls.deliverNtfy.length, 1);
  assert.deepEqual(deps.calls.deliverNtfy[0], { topic: "test-topic", message: "a fake generated message" });
  assert.equal(deps.calls.appendJournal.length, 1);
  const journaled = deps.calls.appendJournal[0] as { entry: { kind: string; rule: string; message_text: string; delivered: boolean } };
  assert.equal(journaled.entry.kind, "fired");
  assert.equal(journaled.entry.rule, "R1");
  assert.equal(journaled.entry.message_text, "a fake generated message");
  assert.equal(journaled.entry.delivered, true);
});

test("runCheck: an acknowledgment is computed and passed through to generateMessage", async () => {
  // Monday's R1 nudge already fired and was followed by a completed
  // session — computeAcknowledgment should surface that. Wednesday is a
  // fresh, unlogged training day, so R1 fires again on its own terms;
  // the point of this test is that the Monday ack rides along with it.
  const state = baseState({
    sessions: [{ date: "2026-07-06", type: "Push", status: "completed", note: "done after nudge" }],
  });
  const firedLog: FiredLogEntry[] = [{ date: "2026-07-06", rule: "R1" }];
  const now = new Date("2026-07-08T18:00:00Z"); // Wednesday, within the nudge window
  const deps = fakeDeps();

  const result = await runCheck(state, now, firedLog, "/fake/journal.jsonl", true, deps);

  assert.equal(result.fired?.rule, "R1");
  assert.deepEqual(result.ack, { date: "2026-07-06", type: "Push" });
  assert.equal(deps.calls.generateMessage.length, 1);
  const call = deps.calls.generateMessage[0] as { ack: { date: string; type: string } | null };
  assert.deepEqual(call.ack, { date: "2026-07-06", type: "Push" });
});
