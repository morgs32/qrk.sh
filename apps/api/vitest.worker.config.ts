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
      miniflare: {
        bindings: {
          CLERK_SECRET_KEY: "sk_test_qrk_api_workerd",
          CLERK_AUTHORIZED_PARTY: "http://127.0.0.1:3001",
          R2_PUBLIC_BASE_URL: "/assets",
        },
      },
    }),
  ],
  test: {
    include: ["**/*.e2e.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    testTimeout: 60_000,
  },
});
