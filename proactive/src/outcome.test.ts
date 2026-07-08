import assert from "node:assert/strict";
import { test } from "node:test";
import { findUnresolvedNudge } from "./outcome.js";
import type { JournalEntry } from "./types.js";

function fired(timestamp: string, rule: "R1" | "R2" = "R1"): JournalEntry {
  return { kind: "fired", timestamp, rule, message_text: "test", delivered: true };
}

function outcome(fired_at: string, acted: boolean): JournalEntry {
  return { kind: "outcome", timestamp: fired_at, rule: "R1", fired_at, acted };
}

test("finds a delivered nudge with no outcome yet, within the window", () => {
  const journal = [fired("2026-07-13T14:30:00Z")];
  const now = new Date("2026-07-13T15:30:00Z"); // 1h later
  const result = findUnresolvedNudge(journal, now, 3);
  assert.equal(result?.timestamp, "2026-07-13T14:30:00Z");
});

test("does not return a nudge already resolved with an outcome", () => {
  const journal = [fired("2026-07-13T14:30:00Z"), outcome("2026-07-13T14:30:00Z", true)];
  const now = new Date("2026-07-13T15:00:00Z");
  const result = findUnresolvedNudge(journal, now, 3);
  assert.equal(result, null);
});

test("does not return a nudge outside the acted-on window", () => {
  const journal = [fired("2026-07-13T10:00:00Z")];
  const now = new Date("2026-07-13T15:00:00Z"); // 5h later
  const result = findUnresolvedNudge(journal, now, 3);
  assert.equal(result, null);
});

test("skips a resolved nudge to find an earlier unresolved one, still within window", () => {
  const journal = [
    fired("2026-07-13T12:00:00Z", "R1"),
    fired("2026-07-13T14:00:00Z", "R2"),
    outcome("2026-07-13T14:00:00Z", true),
  ];
  const now = new Date("2026-07-13T14:30:00Z"); // 2.5h after the first, 0.5h after the second
  const result = findUnresolvedNudge(journal, now, 3);
  assert.equal(result?.timestamp, "2026-07-13T12:00:00Z");
});
