import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite-plus";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(packageRoot, ".env.local") });

export default defineConfig({
  root: packageRoot,
  plugins: [
    cloudflareTest({
      wrangler: { configPath: path.join(packageRoot, "wrangler.jsonc") },
    }),
  ],
  test: {
    include: ["**/*.live.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
