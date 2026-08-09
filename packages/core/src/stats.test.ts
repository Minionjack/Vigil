import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSessionStats, renderVerifiedStats } from "./stats.js";
import type { CoreSession } from "./stats.js";

test("computeSessionStats counts completed and skipped per type", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-13", type: "Push", status: "completed" },
    { date: "2026-07-08", type: "Pull", status: "completed" },
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired after work" },
    { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work is crazy this week" },
  ];

  const stats = computeSessionStats(sessions, "2026-07-20");

  assert.equal(stats["Legs"].completed, 0);
  assert.equal(stats["Legs"].skipped, 2);
  assert.equal(stats["Pull"].completed, 1);
  assert.equal(stats["Pull"].skipped, 0);
});

test("computeSessionStats: daysSinceLastCompleted is null for a type with zero completions", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired" }];
  const stats = computeSessionStats(sessions, "2026-07-20");
  assert.equal(stats["Legs"].daysSinceLastCompleted, null);
});

test("computeSessionStats: daysSinceLastCompleted counts from the most recent completed session of that type", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-06", type: "Pull", status: "completed" },
    { date: "2026-06-29", type: "Pull", status: "completed" },
  ];
  const stats = computeSessionStats(sessions, "2026-07-20");
  assert.equal(stats["Pull"].daysSinceLastCompleted, 14); // from 07-06, the more recent of the two
});

test("computeSessionStats: daysSinceLastCompleted is null, not negative, when the completion is after 'today'", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-21", type: "Push", status: "completed" }];
  const stats = computeSessionStats(sessions, "2026-07-20");
  assert.equal(stats["Push"].daysSinceLastCompleted, null);
});

test("renderVerifiedStats flags a zero-completed type and forbids inferred trends", () => {
  const stats = computeSessionStats(
    [
      { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired" },
      { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "busy" },
    ],
    "2026-07-20"
  );

  const rendered = renderVerifiedStats(stats);
  assert.match(rendered, /0 completed, 2 skipped/);
  assert.match(rendered, /No legs performance data exists/);
});

test("renderVerifiedStats states days-since-last-completed as a rendered fact", () => {
  const stats = computeSessionStats([{ date: "2026-07-06", type: "Pull", status: "completed" }], "2026-07-20");
  const rendered = renderVerifiedStats(stats);
  assert.match(rendered, /Pull: 1 completed, never skipped, last completed 14 days ago, in logged history\./);
});

test("renderVerifiedStats: weight defaults to 'none logged yet' when omitted", () => {
  const rendered = renderVerifiedStats(computeSessionStats([], "2026-07-20"));
  assert.match(rendered, /Weight: none logged yet/);
});

test("renderVerifiedStats: weight renders as a number and a date, with a no-rate warning", () => {
  const rendered = renderVerifiedStats(computeSessionStats([], "2026-07-20"), { date: "2026-07-18", weight_kg: 87.5 });
  assert.match(rendered, /Weight: last logged 87\.5kg on 2026-07-18\./);
  assert.match(rendered, /never state a rate, a change, or a projection/);
});
