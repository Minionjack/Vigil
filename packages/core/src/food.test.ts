import { test, expect } from "vitest";
import { computeFoodStats, renderFoodLog, validateFoodEstimateProvenance } from "./food.js";
import type { FoodEvent } from "./food.js";

const TODAY = "2026-08-27";

test("computeFoodStats includes entries within the window, most recent first, with daysAgo computed", () => {
  const events: FoodEvent[] = [
    { occurred_at: "2026-08-25T12:00:00Z", payload: { text: "chicken and rice" } },
    { occurred_at: "2026-08-26T12:00:00Z", payload: { text: "skipped lunch, meetings all day" } },
  ];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.count).toBe(2);
  expect(stats.entries).toEqual([
    { date: "2026-08-26", text: "skipped lunch, meetings all day", daysAgo: 1 },
    { date: "2026-08-25", text: "chicken and rice", daysAgo: 2 },
  ]);
  expect(stats.totalCaloriesEst).toBe(0);
  expect(stats.entriesWithEstimate).toBe(0);
  expect(stats.entriesWithoutEstimate).toBe(2);
});

test("computeFoodStats excludes entries older than the window", () => {
  const events: FoodEvent[] = [
    { occurred_at: "2026-08-10T12:00:00Z", payload: { text: "old entry, 17 days ago" } },
    { occurred_at: "2026-08-26T12:00:00Z", payload: { text: "recent" } },
  ];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.count).toBe(1);
  expect(stats.entries).toEqual([{ date: "2026-08-26", text: "recent", daysAgo: 1 }]);
});

test("computeFoodStats includes an entry exactly on the window boundary", () => {
  const events: FoodEvent[] = [{ occurred_at: "2026-08-20T12:00:00Z", payload: { text: "exactly 7 days ago" } }];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.count).toBe(1);
  expect(stats.entries[0].daysAgo).toBe(7);
});

test("computeFoodStats excludes a future-dated entry", () => {
  const events: FoodEvent[] = [{ occurred_at: "2026-08-28T12:00:00Z", payload: { text: "tomorrow, somehow" } }];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.count).toBe(0);
});

test("computeFoodStats: an entry dated the exact same day as today gets daysAgo 0, not treated as yesterday", () => {
  // Found live: the model called a same-day entry "yesterday" when the
  // block only rendered a bare date and left the comparison to it.
  const events: FoodEvent[] = [{ occurred_at: `${TODAY}T12:00:00Z`, payload: { text: "just now" } }];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.entries[0].daysAgo).toBe(0);
});

test("computeFoodStats: empty event list gives a clean zero, not an error", () => {
  const stats = computeFoodStats([], TODAY, 7);
  expect(stats).toEqual({ windowDays: 7, count: 0, entries: [], totalCaloriesEst: 0, entriesWithEstimate: 0, entriesWithoutEstimate: 0 });
});

test("computeFoodStats: an entry with a complete estimate triple carries caloriesEst/source through and sums into totalCaloriesEst", () => {
  const events: FoodEvent[] = [
    { occurred_at: "2026-08-26T12:00:00Z", payload: { text: "chicken and rice", calories_est: 650, source: "gemini", estimated_at: "2026-08-26T12:05:00Z" } },
    { occurred_at: "2026-08-25T12:00:00Z", payload: { text: "toast" } },
  ];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.entries[0]).toEqual({ date: "2026-08-26", text: "chicken and rice", daysAgo: 1, caloriesEst: 650, source: "gemini" });
  expect(stats.entries[1]).toEqual({ date: "2026-08-25", text: "toast", daysAgo: 2 });
  expect(stats.totalCaloriesEst).toBe(650);
  expect(stats.entriesWithEstimate).toBe(1);
  expect(stats.entriesWithoutEstimate).toBe(1);
});

test("computeFoodStats: an entry with an incomplete estimate (e.g. calories_est but no source) is treated as no estimate, not thrown on", () => {
  // Read-time defensive handling of data that should never exist (the
  // write-time validator would have rejected it) — never crash a render
  // over one corrupt historical row.
  const events: FoodEvent[] = [{ occurred_at: "2026-08-26T12:00:00Z", payload: { text: "mystery meal", calories_est: 400 } }];
  const stats = computeFoodStats(events, TODAY, 7);
  expect(stats.entries[0]).toEqual({ date: "2026-08-26", text: "mystery meal", daysAgo: 1 });
  expect(stats.entriesWithEstimate).toBe(0);
  expect(stats.entriesWithoutEstimate).toBe(1);
});

test("renderFoodLog: empty case states absence plainly", () => {
  const rendered = renderFoodLog({ windowDays: 7, count: 0, entries: [], totalCaloriesEst: 0, entriesWithEstimate: 0, entriesWithoutEstimate: 0 });
  expect(rendered).toMatch(/No food logged in the last 7 days\./);
  expect(rendered).toMatch(/never estimate calories\/macros\/nutrition/);
});

test("renderFoodLog: populated case renders verbatim text, real dates, and the relative-day label", () => {
  const rendered = renderFoodLog({
    windowDays: 7,
    count: 2,
    entries: [
      { date: "2026-08-26", text: "skipped lunch, meetings all day", daysAgo: 0 },
      { date: "2026-08-25", text: "chicken and rice", daysAgo: 1 },
    ],
    totalCaloriesEst: 0,
    entriesWithEstimate: 0,
    entriesWithoutEstimate: 2,
  });
  expect(rendered).toMatch(/2 entries logged in the last 7 days/);
  expect(rendered).toMatch(/- 2026-08-26 \(today\): "skipped lunch, meetings all day"/);
  expect(rendered).toMatch(/- 2026-08-25 \(yesterday\): "chicken and rice"/);
  expect(rendered).not.toMatch(/Estimated total/);
});

test("renderFoodLog: N-days-ago wording for anything older than yesterday", () => {
  const rendered = renderFoodLog({
    windowDays: 7,
    count: 1,
    entries: [{ date: "2026-08-20", text: "protein shake and oats", daysAgo: 7 }],
    totalCaloriesEst: 0,
    entriesWithEstimate: 0,
    entriesWithoutEstimate: 1,
  });
  expect(rendered).toMatch(/- 2026-08-20 \(7 days ago\): "protein shake and oats"/);
});

test("renderFoodLog: singular wording for exactly one entry", () => {
  const rendered = renderFoodLog({
    windowDays: 7,
    count: 1,
    entries: [{ date: "2026-08-26", text: "toast", daysAgo: 0 }],
    totalCaloriesEst: 0,
    entriesWithEstimate: 0,
    entriesWithoutEstimate: 1,
  });
  expect(rendered).toMatch(/1 entry logged in the last 7 days/);
});

test("renderFoodLog: an entry with a stored estimate is cited hedged and attributed, never as a bare number", () => {
  const rendered = renderFoodLog({
    windowDays: 7,
    count: 1,
    entries: [{ date: "2026-08-26", text: "chicken and rice", daysAgo: 0, caloriesEst: 650, source: "gemini" }],
    totalCaloriesEst: 650,
    entriesWithEstimate: 1,
    entriesWithoutEstimate: 0,
  });
  expect(rendered).toMatch(/- 2026-08-26 \(today\): "chicken and rice" — about 650 kcal, estimated via gemini, not verified/);
  expect(rendered).toMatch(/Estimated total: ~650 kcal across 1 of 1 entry/);
  expect(rendered).not.toMatch(/with no stored estimate/); // nothing to caveat when every entry has one
});

test("renderFoodLog: mixed estimated/unestimated entries report the total against the right denominator and flag the gap", () => {
  const rendered = renderFoodLog({
    windowDays: 7,
    count: 2,
    entries: [
      { date: "2026-08-26", text: "chicken and rice", daysAgo: 0, caloriesEst: 650, source: "gemini" },
      { date: "2026-08-25", text: "toast", daysAgo: 1 },
    ],
    totalCaloriesEst: 650,
    entriesWithEstimate: 1,
    entriesWithoutEstimate: 1,
  });
  expect(rendered).toMatch(/- 2026-08-25 \(yesterday\): "toast"$/m); // no estimate note appended
  expect(rendered).toMatch(/Estimated total: ~650 kcal across 1 of 2 entries \(1 with no stored estimate\)\./);
});

test("validateFoodEstimateProvenance: all three fields present returns the provenance object", () => {
  const result = validateFoodEstimateProvenance({ calories_est: 650, source: "gemini", estimated_at: "2026-08-26T12:05:00Z" });
  expect(result).toEqual({ calories_est: 650, source: "gemini", estimated_at: "2026-08-26T12:05:00Z" });
});

test("validateFoodEstimateProvenance: none present returns undefined — a food entry with no estimate is valid", () => {
  expect(validateFoodEstimateProvenance({})).toBeUndefined();
});

test("validateFoodEstimateProvenance: a partial triple throws rather than silently defaulting", () => {
  expect(() => validateFoodEstimateProvenance({ calories_est: 650 })).toThrow(/Incomplete calorie-estimate provenance/);
  expect(() => validateFoodEstimateProvenance({ source: "gemini" })).toThrow(/Incomplete calorie-estimate provenance/);
  expect(() => validateFoodEstimateProvenance({ calories_est: 650, source: "gemini" })).toThrow(/Incomplete calorie-estimate provenance/);
});
