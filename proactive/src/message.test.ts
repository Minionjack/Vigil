import { test, expect } from "vitest";
import { buildSystemPrompt } from "./message.js";
import type { RuleFired } from "@vigil/core";
import type { State } from "./types.js";

// Marker unique to coach-prompts/core-rules.md — regression guard against
// the grounding constitution drifting back into per-personality or
// per-surface files (drill-sergeant.md and proactive-extension.md each
// carried their own independent, already-diverging copy before the
// Phase 1 refactor).
const CORE_RULES_MARKER = "you never derive, you only phrase";

function baseState(personality?: State["client"]["personality"]): State {
  return {
    client: {
      name: "Jack",
      goal: "Lose 8 kg by 30 September 2026 and bench 100 kg",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30",
      timezone: "Asia/Dubai",
      personality,
    },
    current_program: {
      name: "Push/Pull/Legs — Week 5 of 8",
      next_session: { type: "Push", planned: ["Bench 4x6 @ 82.5kg"], fallback_30min: ["Bench 4x6"] },
    },
    sessions: [],
    journal_config: {
      max_messages_per_day: 2,
      quiet_hours: { before: "06:30", after: "21:30" },
      delivery: { method: "ntfy", topic: "test-topic" },
    },
  };
}

const fired: RuleFired = { rule: "R1", reason: "test" };
const now = new Date("2026-07-13T14:00:00Z");

test("buildSystemPrompt (proactive) includes core-rules regardless of personality", () => {
  for (const personality of ["drill-sergeant", "mentor", "hype"] as const) {
    const prompt = buildSystemPrompt(baseState(personality), now, fired, null);
    expect(prompt, `missing core-rules marker for ${personality}`).toMatch(new RegExp(CORE_RULES_MARKER));
  }
});

test("buildSystemPrompt (proactive) falls back to drill-sergeant when personality is unset", () => {
  const unset = buildSystemPrompt(baseState(undefined), now, fired, null);
  const explicit = buildSystemPrompt(baseState("drill-sergeant"), now, fired, null);
  expect(unset).toBe(explicit);
});
