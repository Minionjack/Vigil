import { test, expect } from "vitest";
import { computeDashboardStats } from "./dashboard.js";
import type { CoreSession } from "./stats.js";

const TRAINING_DAYS = ["Monday", "Wednesday", "Friday"];
// 2026-07-06 is a Monday (established convention across this repo's fixtures).
const TODAY = "2026-07-20"; // a Monday, 2 weeks after 07-06

test("currentStreak: an unbroken run of completions counts all of them", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-17", type: "Push", status: "completed" },
    { date: "2026-07-15", type: "Legs", status: "completed" },
    { date: "2026-07-13", type: "Pull", status: "completed" },
  ];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 4);
  expect(stats.currentStreak).toBe(3);
});

test("currentStreak: stops counting at the first skip encountered going backward", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-17", type: "Push", status: "completed" },
    { date: "2026-07-15", type: "Legs", status: "completed" },
    { date: "2026-07-13", type: "Pull", status: "skipped", excuse: "busy" },
    { date: "2026-07-10", type: "Push", status: "completed" },
  ];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 4);
  expect(stats.currentStreak).toBe(2);
});

test("currentStreak: 0 when the most recent logged entry is a skip", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-17", type: "Push", status: "skipped", excuse: "busy" },
    { date: "2026-07-15", type: "Legs", status: "completed" },
  ];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 4);
  expect(stats.currentStreak).toBe(0);
});

test("currentStreak: 0 for an empty log", () => {
  const stats = computeDashboardStats([], TRAINING_DAYS, TODAY, 4);
  expect(stats.currentStreak).toBe(0);
});

test("weeklyBreakdown: buckets completions into the correct week, scheduled matches training_days.length", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-06", type: "Push", status: "completed" }, // week of 07-06
    { date: "2026-07-08", type: "Pull", status: "completed" }, // week of 07-06
    { date: "2026-07-13", type: "Legs", status: "completed" }, // week of 07-13
  ];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 3);
  // weeksBack=3 from TODAY (week of 07-20) -> weeks 07-06, 07-13, 07-20, oldest first.
  expect(stats.weeklyBreakdown).toEqual([
    { weekStart: "2026-07-06", completed: 2, scheduled: 3 },
    { weekStart: "2026-07-13", completed: 1, scheduled: 3 },
    { weekStart: "2026-07-20", completed: 0, scheduled: 3 },
  ]);
});

test("weeklyBreakdown: a skip doesn't count toward completed", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-06", type: "Push", status: "skipped", excuse: "busy" }];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 1);
  expect(stats.weeklyBreakdown).toEqual([{ weekStart: "2026-07-20", completed: 0, scheduled: 3 }]);
});

test("perTypeCompletion: counts completed/skipped per type within the trailing window only", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-17", type: "Push", status: "completed" },
    { date: "2026-07-13", type: "Push", status: "skipped", excuse: "busy" },
    { date: "2026-06-01", type: "Push", status: "completed" }, // outside a 4-week window from TODAY
  ];
  const stats = computeDashboardStats(sessions, TRAINING_DAYS, TODAY, 4);
  expect(stats.perTypeCompletion).toEqual({ Push: { completed: 1, skipped: 1 } });
});

test("perTypeCompletion: empty for a type with nothing logged", () => {
  const stats = computeDashboardStats([], TRAINING_DAYS, TODAY, 4);
  expect(stats.perTypeCompletion).toEqual({});
});
