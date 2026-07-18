import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const scraperDevVarsPath = fileURLToPath(new URL("../../../scraper/.dev.vars", import.meta.url));

if (!existsSync(scraperDevVarsPath)) {
  throw new Error(
    `Real-token bricks Playwright tests require ${scraperDevVarsPath} with a non-empty GITHUB_TOKEN`,
  );
}

const scraperDevVars = readFileSync(scraperDevVarsPath, "utf8");
const githubTokenMatch = /^\s*GITHUB_TOKEN\s*=\s*(.+?)\s*$/m.exec(scraperDevVars);
const githubTokenValue = githubTokenMatch?.[1]?.trim();

if (
  githubTokenValue === undefined ||
  githubTokenValue.length === 0 ||
  githubTokenValue.startsWith("#") ||
  githubTokenValue === '""' ||
  githubTokenValue === "''"
) {
  throw new Error(
    `Real-token bricks Playwright tests require ${scraperDevVarsPath} with a non-empty GITHUB_TOKEN`,
  );
}

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
