import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(__dirname, "../core/src")}/$1`,
      },
      {
        find: "@zerospin/core",
        replacement: path.join(__dirname, "../core/src"),
      },
      {
        find: "@livestore/wa-sqlite/dist/wa-sqlite.mjs",
        replacement: path.resolve(
          __dirname,
          "../core/node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs",
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/test-setup.ts"],
    globals: true,
    testTimeout: 120_000,
    include: [
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "src/**/*.react.spec.ts",
      "src/**/*.react.spec.tsx",
    ],
  },
});
