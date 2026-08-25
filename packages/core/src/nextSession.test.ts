import { test, expect } from "vitest";
import { dateStringInTz } from "./dateTz.js";
import { computeNextScheduledSession } from "./nextSession.js";

const TRAINING_DAYS = ["Monday", "Wednesday", "Friday"];

// 2026-07-06 is a Monday (established across the fixtures/tests in this repo).
test("next training day later this week", () => {
  const today = dateStringInTz(new Date("2026-07-07T10:00:00Z"), "Asia/Dubai"); // Tuesday — not a training day
  const next = computeNextScheduledSession(TRAINING_DAYS, [], today);
  expect(next).toEqual({ date: "2026-07-08", weekday: "Wednesday" });
});

test("wraps around past Friday to next Monday", () => {
  const today = dateStringInTz(new Date("2026-07-11T10:00:00Z"), "Asia/Dubai"); // Saturday
  const next = computeNextScheduledSession(TRAINING_DAYS, [], today);
  expect(next).toEqual({ date: "2026-07-13", weekday: "Monday" });
});

test("today is a training day with nothing logged yet -> today is next", () => {
  const today = dateStringInTz(new Date("2026-07-06T10:00:00Z"), "Asia/Dubai"); // Monday
  const next = computeNextScheduledSession(TRAINING_DAYS, [], today);
  expect(next).toEqual({ date: "2026-07-06", weekday: "Monday" });
});

test("today is a training day already logged -> skips to the next one", () => {
  const today = dateStringInTz(new Date("2026-07-06T10:00:00Z"), "Asia/Dubai"); // Monday, already logged
  const next = computeNextScheduledSession(TRAINING_DAYS, ["2026-07-06"], today);
  expect(next).toEqual({ date: "2026-07-08", weekday: "Wednesday" });
});

test("a single training day, already logged today, wraps to next week rather than throwing", () => {
  // Found live: a profile with only one training day whose sole weekly
  // occurrence is already logged has nothing to find within a 6-day
  // lookahead — the loop must reach offset 7 (next week's same weekday).
  const today = dateStringInTz(new Date("2026-07-07T10:00:00Z"), "Asia/Dubai"); // Tuesday, already logged
  const next = computeNextScheduledSession(["Tuesday"], ["2026-07-07"], today);
  expect(next).toEqual({ date: "2026-07-14", weekday: "Tuesday" });
});
