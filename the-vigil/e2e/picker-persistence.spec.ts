import { test, expect } from "@playwright/test";

// NOTE: runs against Expo's web build (react-native-web), not Expo Go on
// a real device. AsyncStorage on web is backed by localStorage, which is
// what this test actually exercises persisting across a reload — a real
// check, but a proxy for the iOS behavior, not a replacement for it.
// CLAUDE.md's "test on a real phone via Expo Go" rule still applies to
// this feature separately.

test("personality picker persists across a reload", async ({ page }) => {
  // Every Playwright test gets a fresh, isolated browser context by
  // default — empty localStorage, so the picker is guaranteed to show.
  await page.goto("/");

  await expect(page.getByText("Choose your coach")).toBeVisible();
  await expect(page.getByTestId("picker-card-drill-sergeant")).toBeVisible();
  await expect(page.getByTestId("picker-card-mentor")).toBeVisible();
  await expect(page.getByTestId("picker-card-hype")).toBeVisible();

  await page.getByTestId("picker-card-mentor").click();

  // Picker gone, header reflects the choice.
  await expect(page.getByText("Choose your coach")).not.toBeVisible();
  await expect(page.getByText("VIGIL · Mentor")).toBeVisible();

  await page.reload();

  // The persisted selection means the picker must not reappear.
  await expect(page.getByText("Choose your coach")).not.toBeVisible();
  await expect(page.getByText("VIGIL · Mentor")).toBeVisible();
});
