import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.playwright.spec.ts",
  testIgnore: ["**/node_modules/**", "**/.next/**", "**/build/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 120_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3333",
    trace: "on-first-retry",
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  },
  projects: [
    { name: "firefox", use: devices["Desktop Firefox"] },
    { name: "webkit", use: devices["Desktop Safari"] },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1"
      ? undefined
      : {
          command: "pnpm nx run @qrk.sh/app:build && PORT=3333 pnpm nx run @qrk.sh/app:start",
          url: "http://127.0.0.1:3333",
          reuseExistingServer: false,
          timeout: 300_000,
        },
});
