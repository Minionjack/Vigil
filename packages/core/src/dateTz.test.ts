import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, dateStringInTz, mondayOfWeek, weekdayOfDateString } from "./dateTz.js";

test("weekdayOfDateString: 2026-07-06 is a Monday", () => {
  assert.equal(weekdayOfDateString("2026-07-06"), "Monday");
});

test("addDays: adds across a month boundary", () => {
  assert.equal(addDays("2026-07-30", 3), "2026-08-02");
});

test("daysBetween: counts whole days regardless of time-of-day anchoring", () => {
  assert.equal(daysBetween("2026-07-13", "2026-07-25"), 12);
  assert.equal(daysBetween("2026-07-25", "2026-07-25"), 0);
});

test("mondayOfWeek: returns the Monday that starts the given date's week", () => {
  assert.equal(mondayOfWeek("2026-07-09"), "2026-07-06"); // Thursday -> that week's Monday
  assert.equal(mondayOfWeek("2026-07-06"), "2026-07-06"); // Monday -> itself
});

test("dateStringInTz: Asia/Dubai (+4) rolls to the next calendar day before UTC does", () => {
  const lateUtc = new Date("2026-07-13T21:00:00Z"); // 01:00 next day in Dubai
  assert.equal(dateStringInTz(lateUtc, "Asia/Dubai"), "2026-07-14");
  assert.equal(dateStringInTz(lateUtc, "UTC"), "2026-07-13");
});
