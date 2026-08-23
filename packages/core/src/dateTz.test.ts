import { test, expect } from "vitest";
import { addDays, daysBetween, dateStringInTz, mondayOfWeek, weekdayOfDateString } from "./dateTz.js";

test("weekdayOfDateString: 2026-07-06 is a Monday", () => {
  expect(weekdayOfDateString("2026-07-06")).toBe("Monday");
});

test("addDays: adds across a month boundary", () => {
  expect(addDays("2026-07-30", 3)).toBe("2026-08-02");
});

test("daysBetween: counts whole days regardless of time-of-day anchoring", () => {
  expect(daysBetween("2026-07-13", "2026-07-25")).toBe(12);
  expect(daysBetween("2026-07-25", "2026-07-25")).toBe(0);
});

test("mondayOfWeek: returns the Monday that starts the given date's week", () => {
  expect(mondayOfWeek("2026-07-09")).toBe("2026-07-06"); // Thursday -> that week's Monday
  expect(mondayOfWeek("2026-07-06")).toBe("2026-07-06"); // Monday -> itself
});

test("dateStringInTz: Asia/Dubai (+4) rolls to the next calendar day before UTC does", () => {
  const lateUtc = new Date("2026-07-13T21:00:00Z"); // 01:00 next day in Dubai
  expect(dateStringInTz(lateUtc, "Asia/Dubai")).toBe("2026-07-14");
  expect(dateStringInTz(lateUtc, "UTC")).toBe("2026-07-13");
});
