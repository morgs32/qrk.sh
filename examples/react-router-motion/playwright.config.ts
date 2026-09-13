import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4319", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox", use: devices["Desktop Firefox"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
  webServer: {
    command:
      process.env.PREVIEW === "1"
        ? "pnpm nx run @qrk.sh/react-router-motion:build && pnpm nx run @qrk.sh/react-router-motion:preview"
        : "pnpm nx run @qrk.sh/react-router-motion:dev",
    url: "http://127.0.0.1:4319",
    reuseExistingServer: false,
  },
});
