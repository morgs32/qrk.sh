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
        bindings: { GITHUB_TOKEN: "deterministic-test-token" },
      },
      wrangler: {
        configPath: path.join(packageRoot, "wrangler.jsonc"),
      },
    }),
  ],
  test: {
    include: ["src/**/*.e2e.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
