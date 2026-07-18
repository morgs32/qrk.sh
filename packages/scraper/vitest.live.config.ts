import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(packageRoot, ".env.local") });

const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;

if (googlePlacesApiKey === undefined || googlePlacesApiKey.length === 0) {
  throw new Error(`GOOGLE_PLACES_API_KEY is required in ${packageRoot}/.env.local`);
}

export default defineConfig({
  root: packageRoot,
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          FIGMA_TOKEN: process.env.FIGMA_TOKEN ?? "missing-live-figma-token",
          GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "missing-live-github-token",
          GOOGLE_PLACES_API_KEY: googlePlacesApiKey,
          SCRAPER_LIVE_FIGMA_BOARD_URL:
            process.env.SCRAPER_LIVE_FIGMA_BOARD_URL ?? "missing-live-figma-board-url",
          SCRAPER_LIVE_FIGMA_DESIGN_URL:
            process.env.SCRAPER_LIVE_FIGMA_DESIGN_URL ?? "missing-live-figma-design-url",
          SCRAPER_LIVE_FIGMA_PROTOTYPE_URL:
            process.env.SCRAPER_LIVE_FIGMA_PROTOTYPE_URL ?? "missing-live-figma-prototype-url",
          SCRAPER_LIVE_FIGMA_SLIDES_URL:
            process.env.SCRAPER_LIVE_FIGMA_SLIDES_URL ?? "missing-live-figma-slides-url",
          SCRAPER_LIVE_GITHUB_URL: process.env.SCRAPER_LIVE_GITHUB_URL ?? "missing-live-github-url",
          SCRAPER_LIVE_INSTAGRAM_URL: process.env.SCRAPER_LIVE_INSTAGRAM_URL,
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
