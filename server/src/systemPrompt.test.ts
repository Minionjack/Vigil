import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSessionStats, renderVerifiedStats } from "./systemPrompt.js";

test("computeSessionStats counts completed and skipped per type", () => {
  const sessions = [
    { date: "2026-07-06", type: "Pull", status: "completed", highlight: "rows" },
    { date: "2026-07-03", type: "Push", status: "completed", highlight: "bench" },
    { date: "2026-07-01", type: "Legs", status: "SKIPPED", excuse_given: "too tired after work" },
    { date: "2026-06-29", type: "Pull", status: "completed", highlight: "pull-ups" },
    { date: "2026-06-24", type: "Legs", status: "SKIPPED", excuse_given: "work is crazy this week" },
  ];

  const stats = computeSessionStats(sessions);

  assert.deepEqual(stats["Pull"], { completed: 2, skipped: 0, skipEntries: [] });
  assert.deepEqual(stats["Push"], { completed: 1, skipped: 0, skipEntries: [] });
  assert.equal(stats["Legs"].completed, 0);
  assert.equal(stats["Legs"].skipped, 2);
  assert.deepEqual(stats["Legs"].skipEntries, [
    { date: "2026-07-01", excuse: "too tired after work" },
    { date: "2026-06-24", excuse: "work is crazy this week" },
  ]);
});

test("renderVerifiedStats flags a type with zero completed sessions as having no data", () => {
  const stats = computeSessionStats([
    { date: "2026-07-01", type: "Legs", status: "SKIPPED", excuse_given: "too tired" },
    { date: "2026-06-24", type: "Legs", status: "SKIPPED", excuse_given: "busy" },
  ]);

  const rendered = renderVerifiedStats(stats);
  assert.match(rendered, /0 completed, 2 skipped/);
  assert.match(rendered, /No legs performance data exists/);
  assert.match(rendered, /never reference progress, plateaus, or numbers/);
});

test("renderVerifiedStats reports a clean record for a never-skipped type", () => {
  const stats = computeSessionStats([
    { date: "2026-07-06", type: "Pull", status: "completed", highlight: "rows" },
    { date: "2026-06-29", type: "Pull", status: "completed", highlight: "pull-ups" },
  ]);

  const rendered = renderVerifiedStats(stats);
  assert.match(rendered, /Pull: 2 completed, never skipped/);
});
