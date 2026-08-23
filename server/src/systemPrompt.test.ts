import { test, expect } from "vitest";
import { buildSystemPrompt } from "./systemPrompt.js";

// computeSessionStats and renderVerifiedStats now live in @vigil/core —
// their unit tests moved with them (packages/core/src/stats.test.ts).

// Marker unique to coach-prompts/core-rules.md — regression guard against
// the grounding constitution drifting back into per-personality files
// (drill-sergeant.md and proactive-extension.md each carried their own
// independent, already-diverging copy before the Phase 1 refactor).
const CORE_RULES_MARKER = "you never derive, you only phrase";

test("buildSystemPrompt includes core-rules regardless of personality", () => {
  for (const personality of ["drill-sergeant", "mentor", "hype"] as const) {
    const prompt = buildSystemPrompt(personality);
    expect(prompt, `missing core-rules marker for ${personality}`).toMatch(new RegExp(CORE_RULES_MARKER));
  }
});

test("buildSystemPrompt falls back to drill-sergeant for an unknown personality", () => {
  const known = buildSystemPrompt("drill-sergeant");
  const unknown = buildSystemPrompt("not-a-real-personality");
  expect(unknown).toBe(known);
});
