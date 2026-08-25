import path from "node:path";
import { test, expect } from "vitest";
import dotenv from "dotenv";
import { generateDigest } from "./generateDigest.js";
import type { DigestEvent } from "./digest.js";

// Reuse the API key from ../../server/.env, same pattern as
// proactive/src/check.ts.
dotenv.config({ path: path.resolve(import.meta.dirname, "..", "..", "..", "server", ".env") });

const SYNTHETIC_PERIOD: DigestEvent[] = [
  { occurred_at: "2026-07-06T18:45:00Z", kind: "session_completed", payload: { type: "Pull", note: "rows 5x5@70, clean" } },
  { occurred_at: "2026-07-08T19:10:00Z", kind: "session_completed", payload: { type: "Push", note: "bench 4x6@80, RPE 9 last set" } },
  { occurred_at: "2026-07-10T20:00:00Z", kind: "session_skipped", payload: { type: "Legs", excuse: "too tired after work" } },
  { occurred_at: "2026-07-13T07:00:00Z", kind: "note", payload: { text: "left shoulder clicked a bit on incline, nothing painful" } },
  { occurred_at: "2026-07-17T20:00:00Z", kind: "session_skipped", payload: { type: "Legs", excuse: "work dinner ran long" } },
];

// Vitest's default per-test timeout (5000ms) is shorter than node:test's
// effective default and shorter than a live Claude API call reliably
// completes in — raised explicitly rather than left to fail intermittently.
test(
  "generateDigest never states a number, a session type, or a day name for a synthetic two-week period",
  async () => {
    // The fixture's own payloads name real session types (Push/Pull/Legs)
    // — this only proves anything if the digest text doesn't just parrot
    // them back. "No digits" alone was found insufficient (round 3 of
    // prompt-tuning on this exact failure: a digit-free digest still let
    // a later reader reattach a fabricated excuse to a real date via
    // hedged, type-naming prose) — this asserts the tightened boundary,
    // not just the original one.
    const digest = await generateDigest(SYNTHETIC_PERIOD, "2026-07-06", "2026-07-19");
    expect(digest, `digest contained a digit: "${digest}"`).toMatch(/^\D*$/);
    expect(digest, `digest named a session type: "${digest}"`).not.toMatch(/\b(push|pull|legs)\b/i);
    expect(digest, `digest named a day: "${digest}"`).not.toMatch(
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
  },
  15000
);
