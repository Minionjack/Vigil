import { defineConfig, devices } from "@playwright/test";

// Chromium only, first pass — matches the "adopt lean, expand later" scope
// decision already applied to Vitest/ESLint this same pass. Two servers
// auto-start so `npx playwright test` is a single command: Expo's web
// build (a real but explicitly partial proxy for the actual product
// surface — CLAUDE.md's own rule is "test on a real phone via Expo Go,
// not just the simulator"; these specs verify the web target only) and
// the chat proxy these flows actually talk to.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8090",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx expo start --web --port 8090",
      url: "http://localhost:8090",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "npm run dev",
      cwd: "../server",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
