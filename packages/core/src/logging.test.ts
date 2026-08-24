import { test, expect } from "vitest";
import { looksLikeSetLog, classifyConfirmation } from "./logging.js";

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
