import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "missing-live-github-token",
          SCRAPER_LIVE_GITHUB_URL: process.env.SCRAPER_LIVE_GITHUB_URL ?? "missing-live-github-url",
        },
      },
      wrangler: { configPath: path.join(packageRoot, "wrangler.jsonc") },
    }),
  ],
  test: {
    include: ["src/**/*.live.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
