import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const scraperRoot = fileURLToPath(new URL("../../../scraper", import.meta.url));
const bricksEnvPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
const scraperEnvPath = fileURLToPath(new URL("../../../scraper/.env.local", import.meta.url));

if (!existsSync(bricksEnvPath)) {
  throw new Error(
    `Real-token bricks Playwright tests require ${bricksEnvPath} with a non-empty PUBLIC_MAPBOX_TOKEN`,
  );
}

if (!existsSync(scraperEnvPath)) {
  throw new Error(
    `Real-token bricks Playwright tests require ${scraperEnvPath} with non-empty GITHUB_TOKEN, FIGMA_TOKEN, GOOGLE_PLACES_API_KEY, and STREAMLINE_API_KEY values`,
  );
}

const bricksEnv = readFileSync(bricksEnvPath, "utf8");
const mapboxTokenMatch = /^\s*PUBLIC_MAPBOX_TOKEN\s*=\s*(.+?)\s*$/m.exec(bricksEnv);
const mapboxTokenValue = mapboxTokenMatch?.[1]?.trim();

if (
  mapboxTokenValue === undefined ||
  mapboxTokenValue.length === 0 ||
  mapboxTokenValue.startsWith("#") ||
  mapboxTokenValue === '""' ||
  mapboxTokenValue === "''"
) {
  throw new Error(
    `Real-token bricks Playwright tests require ${bricksEnvPath} with a non-empty PUBLIC_MAPBOX_TOKEN`,
  );
}

const scraperEnv = readFileSync(scraperEnvPath, "utf8");
const githubTokenMatch = /^\s*GITHUB_TOKEN\s*=\s*(.+?)\s*$/m.exec(scraperEnv);
const githubTokenValue = githubTokenMatch?.[1]?.trim();
const figmaTokenMatch = /^\s*FIGMA_TOKEN\s*=\s*(.+?)\s*$/m.exec(scraperEnv);
const figmaTokenValue = figmaTokenMatch?.[1]?.trim();
const googlePlacesApiKeyMatch = /^\s*GOOGLE_PLACES_API_KEY\s*=\s*(.+?)\s*$/m.exec(scraperEnv);
const googlePlacesApiKeyValue = googlePlacesApiKeyMatch?.[1]?.trim();
const streamlineApiKeyMatch = /^\s*STREAMLINE_API_KEY\s*=\s*(.+?)\s*$/m.exec(scraperEnv);
const streamlineApiKeyValue = streamlineApiKeyMatch?.[1]?.trim();

if (
  githubTokenValue === undefined ||
  githubTokenValue.length === 0 ||
  githubTokenValue.startsWith("#") ||
  githubTokenValue === '""' ||
  githubTokenValue === "''" ||
  figmaTokenValue === undefined ||
  figmaTokenValue.length === 0 ||
  figmaTokenValue.startsWith("#") ||
  figmaTokenValue === '""' ||
  figmaTokenValue === "''" ||
  googlePlacesApiKeyValue === undefined ||
  googlePlacesApiKeyValue.length === 0 ||
  googlePlacesApiKeyValue.startsWith("#") ||
  googlePlacesApiKeyValue === '""' ||
  googlePlacesApiKeyValue === "''" ||
  streamlineApiKeyValue === undefined ||
  streamlineApiKeyValue.length === 0 ||
  streamlineApiKeyValue.startsWith("#") ||
  streamlineApiKeyValue === '""' ||
  streamlineApiKeyValue === "''"
) {
  throw new Error(
    `Real-token bricks Playwright tests require ${scraperEnvPath} with non-empty GITHUB_TOKEN, FIGMA_TOKEN, GOOGLE_PLACES_API_KEY, and STREAMLINE_API_KEY values`,
  );
}

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4100",
  },
  webServer: [
    {
      command: "pnpm dev",
      cwd: scraperRoot,
      url: "http://127.0.0.1:8787",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm dev",
      cwd: packageRoot,
      url: "http://127.0.0.1:4100",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
