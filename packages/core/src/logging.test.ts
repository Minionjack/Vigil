import { test, expect } from "vitest";
import { looksLikeSetLog, looksLikeFoodLog, classifyConfirmation, applyCorrectionPatch } from "./logging.js";
import type { PendingLogProposal } from "./logging.js";

test("looksLikeSetLog: a real logging message with a lift name, set notation, and RPE routes to extraction", () => {
  expect(looksLikeSetLog("did push tonight — bench 82.5 for 4x6, last set rpe 9, incline 30s x10x3")).toBe(true);
});

test("looksLikeSetLog: a vague mention of a lift still routes — the confidence gate downstream is what asks for clarification, not this heuristic", () => {
  expect(looksLikeSetLog("did some pressing, felt heavy")).toBe(true);
});

test("looksLikeSetLog: ordinary chat with no lift signal doesn't route", () => {
  expect(looksLikeSetLog("how's the plan looking for tomorrow?")).toBe(false);
  expect(looksLikeSetLog("we good?")).toBe(false);
});

test("looksLikeFoodLog: routes the brief's own three example messages", () => {
  expect(looksLikeFoodLog("had chicken and rice")).toBe(true);
  expect(looksLikeFoodLog("skipped lunch")).toBe(true);
  expect(looksLikeFoodLog("takeaway again")).toBe(true);
});

test("looksLikeFoodLog: ordinary chat with no food signal doesn't route", () => {
  expect(looksLikeFoodLog("how's the plan looking for tomorrow?")).toBe(false);
  expect(looksLikeFoodLog("we good?")).toBe(false);
});

test("classifyConfirmation: a clean yes confirms", () => {
  expect(classifyConfirmation("yes")).toBe("confirm");
  expect(classifyConfirmation("Yep, that's right")).toBe("confirm");
  expect(classifyConfirmation("confirm")).toBe("confirm");
});

test("classifyConfirmation: a clean no denies", () => {
  expect(classifyConfirmation("no")).toBe("deny");
  expect(classifyConfirmation("nope, wrong weight")).toBe("deny");
});

test("classifyConfirmation: anything else is unclear, treated as a correction rather than guessed", () => {
  expect(classifyConfirmation("actually it was 85kg not 82.5")).toBe("unclear");
  expect(classifyConfirmation("wait what")).toBe("unclear");
});

const SINGLE_EXERCISE: PendingLogProposal = {
  type: "Push",
  exercises: [{ exercise: "Bench Press", weight_kg: 80, reps: 8, sets: 1, rpe: 8 }],
};

test("applyCorrectionPatch: single-exercise correction changes only the patched field, others untouched", () => {
  const result = applyCorrectionPatch(SINGLE_EXERCISE, { weight_kg: 85, confidence: { weight_kg: 0.95 } });
  expect(result.unclearFields).toEqual([]);
  expect(result.updated).toEqual({
    type: "Push",
    exercises: [{ exercise: "Bench Press", weight_kg: 85, reps: 8, sets: 1, rpe: 8 }],
  });
});

test("applyCorrectionPatch: multi-exercise correction with a named match targets only that exercise", () => {
  const pending: PendingLogProposal = {
    type: "Push",
    exercises: [
      { exercise: "Bench Press", weight_kg: 80, reps: 8, sets: 1, rpe: 8 },
      { exercise: "Incline Press", weight_kg: 30, reps: 10, sets: 3 },
    ],
  };
  const result = applyCorrectionPatch(pending, {
    exercise: "Incline Press",
    weight_kg: 32.5,
    confidence: { exercise: 0.9, weight_kg: 0.9 },
  });
  expect(result.unclearFields).toEqual([]);
  expect(result.updated).toEqual({
    type: "Push",
    exercises: [
      { exercise: "Bench Press", weight_kg: 80, reps: 8, sets: 1, rpe: 8 },
      { exercise: "Incline Press", weight_kg: 32.5, reps: 10, sets: 3 },
    ],
  });
});

test("applyCorrectionPatch: multi-exercise correction with no named target is ambiguous, not guessed", () => {
  const pending: PendingLogProposal = {
    type: "Push",
    exercises: [
      { exercise: "Bench Press", weight_kg: 80, reps: 8, sets: 1, rpe: 8 },
      { exercise: "Incline Press", weight_kg: 30, reps: 10, sets: 3 },
    ],
  };
  const result = applyCorrectionPatch(pending, { weight_kg: 32.5, confidence: { weight_kg: 0.9 } });
  expect(result.updated).toBeNull();
  expect(result.unclearFields).toEqual(["which exercise this correction is about"]);
});

test("applyCorrectionPatch: a low-confidence patched field is asked about, not applied", () => {
  const result = applyCorrectionPatch(SINGLE_EXERCISE, { weight_kg: 85, confidence: { weight_kg: 0.3 } });
  expect(result.updated).toBeNull();
  expect(result.unclearFields).toEqual(["the corrected weight"]);
});
