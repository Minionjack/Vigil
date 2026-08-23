import { test, expect } from "vitest";
import { isValidCalendarDate } from "./log.js";

test("accepts a real calendar date", () => {
  expect(isValidCalendarDate("2026-07-17")).toBe(true);
});

test("rejects a date JS would otherwise silently roll over", () => {
  // new Date(Date.UTC(2026, 1, 30)) rolls to 2026-03-02 rather than
  // throwing — this is exactly what --date must not let through silently.
  expect(isValidCalendarDate("2026-02-30")).toBe(false);
});

test("rejects an out-of-range month", () => {
  expect(isValidCalendarDate("2026-13-01")).toBe(false);
});

test("accepts a leap day on a leap year, rejects it on a non-leap year", () => {
  expect(isValidCalendarDate("2028-02-29")).toBe(true);
  expect(isValidCalendarDate("2026-02-29")).toBe(false);
});
