import { test, expect } from "vitest";
import { findUnresolvedNudge } from "./outcome.js";
import type { RuleId } from "@vigil/core";
import type { JournalEntry } from "./types.js";

const TZ = "Asia/Dubai"; // UTC+4 — matches the real profile's timezone; chosen so tests fail if the code ever does naive local-Date math instead of using dateStringInTz.

function fired(timestamp: string, rule: RuleId = "R1"): JournalEntry {
  return { kind: "fired", timestamp, rule, message_text: "test", delivered: true };
}

function outcome(fired_at: string, acted: boolean): JournalEntry {
  return { kind: "outcome", timestamp: fired_at, rule: "R1", fired_at, acted };
}

test("finds a delivered R1 nudge with no outcome yet, within the 4h window", () => {
  const journal = [fired("2026-07-13T14:30:00Z", "R1")];
  const now = new Date("2026-07-13T15:30:00Z"); // 1h later
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result?.timestamp).toBe("2026-07-13T14:30:00Z");
});

test("does not return a nudge already resolved with an outcome", () => {
  const journal = [fired("2026-07-13T14:30:00Z", "R1"), outcome("2026-07-13T14:30:00Z", true)];
  const now = new Date("2026-07-13T15:00:00Z");
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result).toBe(null);
});

test("R1: does not return a nudge outside its 4-hour window", () => {
  const journal = [fired("2026-07-13T10:00:00Z", "R1")];
  const now = new Date("2026-07-13T15:00:00Z"); // 5h later
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result).toBe(null);
});

test("skips a resolved nudge to find an earlier unresolved one, still within its window", () => {
  const journal = [
    fired("2026-07-13T12:00:00Z", "R1"),
    fired("2026-07-13T14:00:00Z", "R2"),
    outcome("2026-07-13T14:00:00Z", true),
  ];
  const now = new Date("2026-07-13T14:30:00Z"); // 2.5h after the first (R1, within 4h), 0.5h after the second (resolved)
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result?.timestamp).toBe("2026-07-13T12:00:00Z");
});

test("R2: a same-calendar-day session in the evening still resolves a morning nudge", () => {
  // 2026-07-14T04:00:00Z = 08:00 Asia/Dubai. 2026-07-14T14:45:00Z = 18:45 Asia/Dubai — same local day.
  const journal = [fired("2026-07-14T04:00:00Z", "R2")];
  const now = new Date("2026-07-14T14:45:00Z");
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result?.timestamp).toBe("2026-07-14T04:00:00Z");
});

test("R2: a resolution attempt the following local day is not eligible", () => {
  // 2026-07-14T04:00:00Z = 08:00 Asia/Dubai on the 14th. 2026-07-15T04:00:00Z = 08:00 Asia/Dubai on the 15th.
  const journal = [fired("2026-07-14T04:00:00Z", "R2")];
  const now = new Date("2026-07-15T04:00:00Z");
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result).toBe(null);
});

test("R1: a session logged 5 hours after a 17:45 nudge is not eligible under the 4h window", () => {
  // 2026-07-13T13:45:00Z = 17:45 Asia/Dubai.
  const journal = [fired("2026-07-13T13:45:00Z", "R1")];
  const now = new Date("2026-07-13T18:45:00Z"); // 5h later
  const result = findUnresolvedNudge(journal, now, TZ);
  expect(result).toBe(null);
});
