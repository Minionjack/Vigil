import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidCalendarDate } from "./log.js";

test("accepts a real calendar date", () => {
  assert.equal(isValidCalendarDate("2026-07-17"), true);
});

test("rejects a date JS would otherwise silently roll over", () => {
  // new Date(Date.UTC(2026, 1, 30)) rolls to 2026-03-02 rather than
  // throwing — this is exactly what --date must not let through silently.
  assert.equal(isValidCalendarDate("2026-02-30"), false);
});

test("rejects an out-of-range month", () => {
  assert.equal(isValidCalendarDate("2026-13-01"), false);
});

test("accepts a leap day on a leap year, rejects it on a non-leap year", () => {
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2026-02-29"), false);
});
