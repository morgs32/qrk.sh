import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: path.join(packageRoot, "wrangler.jsonc"),
      },
    }),
  ],
  test: {
    include: ["**/*.e2e.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
