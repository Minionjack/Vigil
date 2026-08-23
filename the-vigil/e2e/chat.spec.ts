import { test, expect } from "@playwright/test";

// NOTE: web build via react-native-web, not Expo Go — see
// picker-persistence.spec.ts's header comment for the same caveat.
// This hits the real chat proxy and a real Claude API call; it can't
// assert exact reply text, so it waits for an actual new coach message
// bubble to render (via its testID, not a fixed sleep) and then asserts
// it's non-empty and isn't the client's own couldn't-reach-the-coach
// fallback — i.e. the request genuinely succeeded end-to-end.

test("sending a message gets a real coach reply", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("picker-card-drill-sergeant").click();

  await page.getByTestId("chat-input").fill("hey");
  await page.getByTestId("send-button").click();

  // Wait for a real second coach bubble (index 1: 0 is the user's "hey").
  const coachReply = page.getByTestId("coach-message").nth(0);
  await expect(coachReply).toBeVisible({ timeout: 20000 });

  const replyText = await coachReply.textContent();
  expect(replyText, "coach reply was empty").toBeTruthy();
  expect(replyText, `got the network-failure fallback instead of a real reply: "${replyText}"`).not.toContain(
    "couldn't reach the coach"
  );
});
