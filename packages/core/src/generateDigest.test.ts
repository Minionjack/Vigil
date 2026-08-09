import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import dotenv from "dotenv";
import { generateDigest } from "./generateDigest.js";
import type { DigestEvent } from "./digest.js";

// Reuse the API key from ../../server/.env, same pattern as
// proactive/src/check.ts.
dotenv.config({ path: path.resolve(import.meta.dirname, "..", "..", "..", "server", ".env") });

const SYNTHETIC_PERIOD: DigestEvent[] = [
  { ts: "2026-07-06T18:45:00Z", kind: "session_completed", payload: { type: "Pull", note: "rows 5x5@70, clean" } },
  { ts: "2026-07-08T19:10:00Z", kind: "session_completed", payload: { type: "Push", note: "bench 4x6@80, RPE 9 last set" } },
  { ts: "2026-07-10T20:00:00Z", kind: "session_skipped", payload: { type: "Legs", excuse: "too tired after work" } },
  { ts: "2026-07-13T07:00:00Z", kind: "note", payload: { text: "left shoulder clicked a bit on incline, nothing painful" } },
  { ts: "2026-07-17T20:00:00Z", kind: "session_skipped", payload: { type: "Legs", excuse: "work dinner ran long" } },
];

test("generateDigest never states a number for a synthetic two-week period", async () => {
  const digest = await generateDigest(SYNTHETIC_PERIOD, "2026-07-06", "2026-07-19");
  assert.match(digest, /^\D*$/, `digest contained a digit: "${digest}"`);
});
