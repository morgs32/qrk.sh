import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { makeWranglerConfig } from "@zerospin/dev-worker/makeWranglerConfig";
import { runnerImport } from "vite-plus";
import { defineConfig } from "vitest/config";

import type * as zerospinConfig from "./zerospin.config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const configModulePath = path.join(packageRoot, "zerospin.config.ts");
const {
  module: { default: config },
} = await runnerImport<typeof zerospinConfig>(configModulePath, {
  environments: {
    inline: { resolve: { noExternal: [/^@zerospin\//, /^@qrk\.sh\//] } },
  },
});
const workerConfig = makeWranglerConfig({
  config,
  configModulePath,
  environment: "dev",
  main: require.resolve("@zerospin/dev-worker/DevWorker"),
});

export default defineConfig({
  root: packageRoot,
  plugins: [
    {
      name: "qrk-in-memory-sqlite",
      enforce: "pre",
      transform(code: string, id: string) {
        if (!id.endsWith("/@livestore/wa-sqlite/dist/wa-sqlite.mjs")) return null;
        // The generated loader reads self.location before replacing it with its
        // own module URL. Workerd has no location; use that same module URL directly.
        return code.replace("scriptDirectory=self.location.href", "scriptDirectory=_scriptName");
      },
      resolveId(source: string, importer: string | undefined) {
        // Workerd cannot read the host filesystem. Use asm for this in-memory test
        // initializer; Durable Object repositories retain their compiled Wasm runtime.
        if (
          source === "sql.js" &&
          importer !== undefined &&
          /\/makeInMemorySqlJsDatabase\.(?:ts|js)$/.test(importer)
        ) {
          return createRequire(importer).resolve("sql.js/dist/sql-asm.js");
        }
        return null;
      },
    },
    cloudflareTest({
      main: workerConfig.main,
      additionalExports: {
        default: "WorkerEntrypoint",
        ...Object.fromEntries(
          workerConfig.durable_objects.bindings.map(
            (binding) => [binding.class_name, "DurableObject"] satisfies [string, "DurableObject"],
          ),
        ),
      },
      miniflare: {
        compatibilityDate: workerConfig.compatibility_date,
        compatibilityFlags: workerConfig.compatibility_flags,
        bindings: {
          ...workerConfig.vars,
          ZEROSPIN_PUBLISHABLE_KEY: "pk_test_qrk_workerd",
          CLERK_AUTHORIZED_PARTY: "http://localhost:4000",
          CLERK_SECRET_KEY: "sk_test_qrk_workerd",
          ZEROSPIN_SECRET_KEY: "sk_test_qrk_system_runtime",
        },
        modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
        durableObjects: Object.fromEntries(
          workerConfig.durable_objects.bindings.map((binding) => [
            binding.name,
            {
              className: binding.class_name,
              useSQLite: workerConfig.exports[binding.class_name]?.storage === "sqlite",
            },
          ]),
        ),
      },
    }),
  ],
  resolve: { alias: workerConfig.alias },
  test: {
    include: ["src/**/*.workerd.spec.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
