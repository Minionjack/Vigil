import { test, expect } from "vitest";
import { resolvePersonality } from "./personality.js";

test("resolvePersonality passes through known ids", () => {
  expect(resolvePersonality("mentor")).toBe("mentor");
  expect(resolvePersonality("hype")).toBe("hype");
  expect(resolvePersonality("drill-sergeant")).toBe("drill-sergeant");
});

test("resolvePersonality falls back to drill-sergeant for anything unrecognized", () => {
  expect(resolvePersonality("not-a-real-personality")).toBe("drill-sergeant");
  expect(resolvePersonality(undefined)).toBe("drill-sergeant");
  expect(resolvePersonality(null)).toBe("drill-sergeant");
  expect(resolvePersonality("")).toBe("drill-sergeant");
});
