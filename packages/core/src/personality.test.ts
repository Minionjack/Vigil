import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePersonality } from "./personality.js";

test("resolvePersonality passes through known ids", () => {
  assert.equal(resolvePersonality("mentor"), "mentor");
  assert.equal(resolvePersonality("hype"), "hype");
  assert.equal(resolvePersonality("drill-sergeant"), "drill-sergeant");
});

test("resolvePersonality falls back to drill-sergeant for anything unrecognized", () => {
  assert.equal(resolvePersonality("not-a-real-personality"), "drill-sergeant");
  assert.equal(resolvePersonality(undefined), "drill-sergeant");
  assert.equal(resolvePersonality(null), "drill-sergeant");
  assert.equal(resolvePersonality(""), "drill-sergeant");
});
