import assert from "node:assert/strict";
import { test } from "node:test";
import { daysSince } from "./daysSince.js";
import type { CoreSession } from "./stats.js";

test("returns null when no completed session of the type exists", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-01", type: "Legs", status: "skipped", excuse: "tired" }];
  assert.equal(daysSince(sessions, "Legs", "2026-07-20"), null);
});

test("returns 0 for a session completed today", () => {
  const sessions: CoreSession[] = [{ date: "2026-07-20", type: "Push", status: "completed" }];
  assert.equal(daysSince(sessions, "Push", "2026-07-20"), 0);
});

test("uses the most recent completed session when several exist", () => {
  const sessions: CoreSession[] = [
    { date: "2026-06-24", type: "Pull", status: "completed" },
    { date: "2026-07-06", type: "Pull", status: "completed" },
    { date: "2026-06-29", type: "Pull", status: "completed" },
  ];
  assert.equal(daysSince(sessions, "Pull", "2026-07-20"), 14); // from 07-06, the latest of the three
});

test("ignores skipped sessions of the same type when finding the most recent completion", () => {
  const sessions: CoreSession[] = [
    { date: "2026-07-15", type: "Legs", status: "skipped", excuse: "busy" },
    { date: "2026-07-01", type: "Legs", status: "completed" },
  ];
  assert.equal(daysSince(sessions, "Legs", "2026-07-20"), 19); // from 07-01, not the later skip
});

test("returns null rather than a negative number when the completion is after 'today'", () => {
  // Can genuinely happen when a caller's `today` is computed from a
  // different clock/timezone reference than the session date was logged
  // against (e.g. a UTC calendar date, for a client east of UTC, late in
  // the day). A wrong number stated as verified fact is worse than silence.
  const sessions: CoreSession[] = [{ date: "2026-07-21", type: "Push", status: "completed" }];
  assert.equal(daysSince(sessions, "Push", "2026-07-20"), null);
});
