import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// The hybrid flow: "logging an event visibly changes verified state" has
// no UI to drive yet — the-vigil has no logging screen, and proactive's
// `npm run log` CLI writes to proactive/state.json, which the chat
// surface never reads (chat reads fake-profile.json; that split-brain
// gap is still real, see BRIEF-PHASE2.md). So the "write" step here edits
// fake-profile.json directly — the only store the chat surface actually
// reads today — rather than going through a CLI that wouldn't reach it.
//
// Also web-build-only, same caveat as the other two specs.

const PROFILE_PATH = path.resolve(import.meta.dirname, "..", "..", "fake-profile.json");
const DISTINCTIVE_WEIGHT = "83.25kg"; // unlikely to appear by coincidence — proves this exact entry reached the reply

test("a newly logged session reaches the coach's reply", async ({ page }) => {
  const original = fs.readFileSync(PROFILE_PATH, "utf-8");
  const profile = JSON.parse(original);

  profile.recent_sessions.unshift({
    date: "2026-07-20",
    type: "Push",
    status: "completed",
    highlight: `Bench 4x6 @ ${DISTINCTIVE_WEIGHT}, felt strong`,
  });

  try {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n");

    await page.goto("/");
    await page.getByTestId("picker-card-drill-sergeant").click();

    await page.getByTestId("chat-input").fill("how did my last push session go?");
    await page.getByTestId("send-button").click();

    const coachReply = page.getByTestId("coach-message").nth(0);
    await expect(coachReply).toBeVisible({ timeout: 20000 });
    await expect(coachReply).toContainText("83.25", { timeout: 20000 });
  } finally {
    // Restored unconditionally, including on assertion failure — this is
    // real project data, not a throwaway fixture, and must not be left
    // mutated by a failed test run.
    fs.writeFileSync(PROFILE_PATH, original);
  }
});
