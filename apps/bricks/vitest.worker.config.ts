import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          GITHUB_TOKEN: "deterministic-test-token",
          FIGMA_TOKEN: "deterministic-figma-token",
          GOOGLE_PLACES_API_KEY: "deterministic-google-places-test-key",
          STREAMLINE_API_KEY: "deterministic-streamline-test-key",
        },
      },
      wrangler: {
        configPath: path.join(packageRoot, "wrangler.jsonc"),
      },
    }),
  ],
  test: {
    include: ["scraper/**/*.e2e.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
