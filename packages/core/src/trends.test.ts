import { test, expect } from "vitest";
import { computeLiftTrends, type TrendEvent } from "./trends.js";

function completed(date: string, exercises: { exercise: string; weight_kg: number; reps: number; rpe?: number }[]): TrendEvent {
  return { occurred_at: `${date}T12:00:00Z`, kind: "session_completed", payload: { type: "Push", exercises } };
}

test("tracks a single lift's top-set weight across sessions, in chronological order", () => {
  const events: TrendEvent[] = [
    completed("2026-07-13", [{ exercise: "Bench press", weight_kg: 82.5, reps: 6, rpe: 7 }]),
    completed("2026-07-06", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 9 }]),
  ];
  const trends = computeLiftTrends(events);
  expect(trends["Bench press"]).toEqual([
    { date: "2026-07-06", topSetWeight_kg: 80 },
    { date: "2026-07-13", topSetWeight_kg: 82.5 },
  ]);
});

test("takes the heaviest set as the session's top set when the same exercise appears more than once", () => {
  const events: TrendEvent[] = [completed("2026-07-13", [{ exercise: "Bench press", weight_kg: 80, reps: 8, rpe: 6 }, { exercise: "Bench press", weight_kg: 82.5, reps: 4, rpe: 9 }])];
  const trends = computeLiftTrends(events);
  expect(trends["Bench press"]).toEqual([{ date: "2026-07-13", topSetWeight_kg: 82.5 }]);
});

test("case-insensitive exercise names merge into one series, using the first-seen casing", () => {
  const events: TrendEvent[] = [
    completed("2026-07-06", [{ exercise: "Bench Press", weight_kg: 80, reps: 6, rpe: 9 }]),
    completed("2026-07-13", [{ exercise: "bench press", weight_kg: 82.5, reps: 6, rpe: 7 }]),
  ];
  const trends = computeLiftTrends(events);
  expect(Object.keys(trends)).toEqual(["Bench Press"]);
  expect(trends["Bench Press"]).toHaveLength(2);
});

test("separates multiple exercises into their own series", () => {
  const events: TrendEvent[] = [completed("2026-07-13", [{ exercise: "Bench press", weight_kg: 82.5, reps: 6, rpe: 7 }, { exercise: "Incline DB press", weight_kg: 30, reps: 10, rpe: 7 }])];
  const trends = computeLiftTrends(events);
  expect(Object.keys(trends).sort()).toEqual(["Bench press", "Incline DB press"]);
});

test("old-shape session_completed rows (no exercises array) are skipped rather than crashing", () => {
  const oldShapeRow: TrendEvent = { occurred_at: "2026-07-06T12:00:00Z", kind: "session_completed", payload: { type: "Push", note: "chest day" } };
  const events: TrendEvent[] = [oldShapeRow, completed("2026-07-13", [{ exercise: "Bench press", weight_kg: 82.5, reps: 6, rpe: 7 }])];
  expect(() => computeLiftTrends(events)).not.toThrow();
  expect(computeLiftTrends(events)["Bench press"]).toHaveLength(1);
});

test("skipped sessions and other event kinds don't produce trend points", () => {
  const events: TrendEvent[] = [{ occurred_at: "2026-07-06T12:00:00Z", kind: "session_skipped", payload: { type: "Push", excuse: "busy" } }];
  expect(computeLiftTrends(events)).toEqual({});
});
