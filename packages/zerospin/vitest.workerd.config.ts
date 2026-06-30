import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig, type Plugin } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zerospinRoot = path.join(__dirname, "..", "..", "..", "zerospin");
const workerMainPath = path.join(__dirname, "src/Worker.ts");
const wranglerVitestPath = path.join(__dirname, "wrangler.vitest.jsonc");
const wasmAdapterShimPath = path.join(
  __dirname,
  "src/shims/makeMigratedInMemoryWasmSqliteDbAdapter.ts",
);
const sqlJsAsmPath = path.join(
  zerospinRoot,
  "packages/core/node_modules/sql.js/dist/sql-asm.js",
);

function wasmToSqljsAdapterShim(): Plugin {
  return {
    name: "wasm-to-sqljs-adapter-shim",
    resolveId(source) {
      if (
        source === "@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDbAdapter" ||
        source.endsWith("makeMigratedInMemoryWasmSqliteDbAdapter.ts") ||
        source.endsWith("makeMigratedInMemoryWasmSqliteDbAdapter")
      ) {
        return wasmAdapterShimPath;
      }
      if (source === "sql.js") {
        return sqlJsAsmPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: [
      {
        find: "@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDbAdapter",
        replacement: wasmAdapterShimPath,
      },
      {
        find: /^sql\.js$/,
        replacement: sqlJsAsmPath,
      },
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(zerospinRoot, "packages/core/src")}/$1`,
      },
      {
        find: "@zerospin/cbor",
        replacement: path.join(zerospinRoot, "packages/cbor/src/index.ts"),
      },
      {
        find: "@zerospin/durables/test",
        replacement: path.join(zerospinRoot, "packages/durables/src/test/index.ts"),
      },
      {
        find: "@zerospin/durables",
        replacement: path.join(zerospinRoot, "packages/durables/src/index.ts"),
      },
      {
        find: "@zerospin/error",
        replacement: path.join(zerospinRoot, "packages/error/src/index.ts"),
      },
      {
        find: "@zerospin/fanout",
        replacement: path.join(zerospinRoot, "packages/fanout/src/index.ts"),
      },
      {
        find: "@zerospin/json-schema-diff",
        replacement: path.join(zerospinRoot, "packages/json-schema-diff/src/index.ts"),
      },
      {
        find: /^apis\/(.+)$/,
        replacement: `${path.join(zerospinRoot, "apps/apis/src")}/$1`,
      },
      {
        find: "getSystemWorker",
        replacement: path.join(__dirname, "src/getSystemWorker.ts"),
      },
      {
        find: "system",
        replacement: path.join(__dirname, "src/system.ts"),
      },
      {
        find: /^system-worker\/(.+)$/,
        replacement: `${path.join(zerospinRoot, "internal/system-worker/src")}/$1`,
      },
      {
        find: "system-worker",
        replacement: path.join(zerospinRoot, "internal/system-worker/src/SystemWorker.ts"),
      },
    ],
  },
  plugins: [
    wasmToSqljsAdapterShim(),
    cloudflareTest({
      main: workerMainPath,
      wrangler: {
        configPath: wranglerVitestPath,
      },
    }),
  ],
  test: {
    include: ["src/**/*.workerd.spec.ts"],
    isolate: true,
    maxWorkers: 1,
    passWithNoTests: true,
    setupFiles: [path.join(__dirname, "vitest.workerd.setup.ts")],
    testTimeout: 300_000,
  },
});
