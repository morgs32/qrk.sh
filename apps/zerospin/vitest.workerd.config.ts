import { createRequire } from "node:module";
import { mergeConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeWorkerdVitestConfig } from "@zerospin/dev-worker/vitest/makeWorkerdVitestConfig";

import config from "./zerospin.config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(makeWorkerdVitestConfig({
  packageRoot,
  config,
  passWithNoTests: false,
  workerBindings: {
    ZEROSPIN_PUBLISHABLE_KEY: "pk_test_qrk_workerd",
    CLERK_AUTHORIZED_PARTY: "http://localhost:4000",
    CLERK_SECRET_KEY: "sk_test_qrk_workerd",
    ZEROSPIN_SECRET_KEY: "sk_test_qrk_system_runtime",
  },
 }), {
  plugins: [{
    name: "qrk-in-memory-sqljs",
    enforce: "pre",
    resolveId(source: string, importer: string | undefined) {
      // Workerd cannot read the host filesystem. Use asm for this in-memory test
      // initializer; Durable Object repositories retain their compiled Wasm runtime.
      if (source === "sql.js" && importer !== undefined && /\/makeInMemorySqlJsDatabase\.(?:ts|js)$/.test(importer)) {
        return createRequire(importer).resolve("sql.js/dist/sql-asm.js");
      }
      return null;
    },
  }],
});
