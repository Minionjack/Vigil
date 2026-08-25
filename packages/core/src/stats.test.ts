import { test, expect } from "vitest";
import {
  computeSessionStats,
  renderVerifiedStats,
  findMatchingSkips,
  determineRelevantSessionType,
  findExactSkipMatch,
} from "./stats.js";
import type { CoreSession } from "./stats.js";

test("computeSessionStats counts completed and skipped per type", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-13", type: "Push", status: "completed" },
    { date: "2026-07-08", type: "Pull", status: "completed" },
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired after work" },
    { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work is crazy this week" },
  ];

  const stats = computeSessionStats(sessions, "2026-07-20");

  expect(stats["Legs"].completed).toBe(0);
  expect(stats["Legs"].skipped).toBe(2);
  expect(stats["Pull"].completed).toBe(1);
  expect(stats["Pull"].skipped).toBe(0);
});

test("computeSessionStats: daysSinceLastCompleted is null for a type with zero completions", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired" }];
  const stats = computeSessionStats(sessions, "2026-07-20");
  expect(stats["Legs"].daysSinceLastCompleted).toBe(null);
});

test("computeSessionStats: daysSinceLastCompleted counts from the most recent completed session of that type", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-06", type: "Pull", status: "completed" },
    { date: "2026-06-29", type: "Pull", status: "completed" },
  ];
  const stats = computeSessionStats(sessions, "2026-07-20");
  expect(stats["Pull"].daysSinceLastCompleted).toBe(14); // from 07-06, the more recent of the two
});

test("computeSessionStats: daysSinceLastCompleted is null, not negative, when the completion is after 'today'", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-21", type: "Push", status: "completed" }];
  const stats = computeSessionStats(sessions, "2026-07-20");
  expect(stats["Push"].daysSinceLastCompleted).toBe(null);
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
  expect(rendered).toMatch(/0 completed, 2 skipped/);
  expect(rendered).toMatch(/No legs performance data exists/);
});

test("renderVerifiedStats states days-since-last-completed as a rendered fact", () => {
  const stats = computeSessionStats([{ date: "2026-07-06", type: "Pull", status: "completed" }], "2026-07-20");
  const rendered = renderVerifiedStats(stats);
  expect(rendered).toMatch(/Pull: 1 completed, never skipped, last completed 14 days ago, in logged history\./);
});

test("renderVerifiedStats states only the count for a type with both completions and skips — detail lives in findMatchingSkips, not here", () => {
  const stats = computeSessionStats(
    [
      { date: "2026-08-10", type: "Push", status: "completed" },
      { date: "2026-07-27", type: "Push", status: "skipped", excuse: "work is crazy" },
    ],
    "2026-08-24"
  );

  const rendered = renderVerifiedStats(stats);
  expect(rendered).toMatch(/Push: 1 completed, 1 skipped, last completed 14 days ago, in logged history\./);
  expect(rendered).not.toMatch(/work is crazy/);
});

test("findMatchingSkips returns the verbatim date and excuse for exactly the requested type", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-15", type: "Push", status: "skipped", excuse: "12 hour workday" },
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired after work" },
    { date: "2026-07-13", type: "Push", status: "completed" },
  ];

  expect(findMatchingSkips(sessions, "Push")).toEqual([{ date: "2026-07-15", excuse: "12 hour workday" }]);
});

test("findMatchingSkips returns an empty list for a type with no skips, not an invented entry", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-13", type: "Pull", status: "completed" }];
  expect(findMatchingSkips(sessions, "Pull")).toEqual([]);
});

test("findMatchingSkips never merges distinct excuses of the same type — each entry stays separate", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-09", type: "Legs", status: "skipped", excuse: "unlogged — didn't train Wednesday" },
    { date: "2026-07-01", type: "Legs", status: "skipped", excuse: "too tired after work" },
    { date: "2026-06-24", type: "Legs", status: "skipped", excuse: "work is crazy this week" },
  ];
  expect(findMatchingSkips(sessions, "Legs")).toHaveLength(3);
});

test("determineRelevantSessionType: a type named in the message wins even if a different type is due today", () => {
  expect(determineRelevantSessionType("can't do legs today, work is crazy", "Push")).toBe("Legs");
});

test("determineRelevantSessionType: falls back to the type due today when no type is named", () => {
  expect(determineRelevantSessionType("can't make it today, work is crazy", "Push")).toBe("Push");
});

test("determineRelevantSessionType: undefined when neither is named nor due today", () => {
  expect(determineRelevantSessionType("can't make it today, work is crazy", undefined)).toBeUndefined();
});

test("findExactSkipMatch returns the entry when the excuse text is identical (trim + case-insensitive)", () => {
  const entries = [{ date: "2026-07-15", excuse: "12 hour workday" }];
  expect(findExactSkipMatch(entries, "  12 HOUR WORKDAY  ")).toEqual({ date: "2026-07-15", excuse: "12 hour workday" });
});

test("findExactSkipMatch returns null for a near-miss, not a fuzzy match", () => {
  const entries = [{ date: "2026-06-24", excuse: "work is crazy this week" }];
  expect(findExactSkipMatch(entries, "work is crazy")).toBeNull();
});

test("findExactSkipMatch returns null when there are no entries to compare against", () => {
  expect(findExactSkipMatch([], "work is crazy")).toBeNull();
});

test("renderVerifiedStats: weight defaults to 'none logged yet' when omitted", () => {
  const rendered = renderVerifiedStats(computeSessionStats([], "2026-07-20"));
  expect(rendered).toMatch(/Weight: none logged yet/);
});

test("renderVerifiedStats: weight renders as a number and a date, with a no-rate warning", () => {
  const rendered = renderVerifiedStats(computeSessionStats([], "2026-07-20"), { date: "2026-07-18", weight_kg: 87.5 });
  expect(rendered).toMatch(/Weight: last logged 87\.5kg on 2026-07-18\./);
  expect(rendered).toMatch(/never state a rate, a change, or a projection/);
});
