import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4100",
  },
  webServer: {
    command: "pnpm dev",
    cwd: packageRoot,
    url: "http://127.0.0.1:4100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
