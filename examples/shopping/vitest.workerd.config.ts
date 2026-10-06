import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { makeWranglerConfig } from '@zerospin/dev-worker/makeWranglerConfig';
import { runnerImport } from 'vite';
import { defineConfig } from 'vitest/config';

import type * as shoppingConfig from './zerospin.config';

const systemModulePath = fileURLToPath(
  new URL('./src/zerospin/system.ts', import.meta.url),
);
const configModulePath = fileURLToPath(
  new URL('./zerospin.config.ts', import.meta.url),
);
// Transform workspace imports while loading authored config in Node, including
// extensionless relative imports used by browser-authored agent metadata.
const {
  module: { default: config },
} = await runnerImport<typeof shoppingConfig>(configModulePath, {
  environments: {
    inline: { resolve: { noExternal: [/^@zerospin\//] } },
  },
});
const workerConfig = makeWranglerConfig({
  config,
  configModulePath,
  environment: 'dev',
  main: fileURLToPath(new URL('./test/support/worker.ts', import.meta.url)),
});

export default defineConfig({
  plugins: [
    {
      name: 'shopping-test-services',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.split('?')[0] !== systemModulePath) return undefined;
        if (source === './ShoppingProvidersLive') {
          return fileURLToPath(
            new URL('./test/support/ShoppingProvidersTest.ts', import.meta.url),
          );
        }
        if (source === './ShoppingPurchaseDeliveryLive') {
          return fileURLToPath(
            new URL(
              './test/support/ShoppingPurchaseDeliveryTest.ts',
              import.meta.url,
            ),
          );
        }
        return undefined;
      },
    },
    cloudflareTest({
      main: workerConfig.main,
      additionalExports: {
        default: 'WorkerEntrypoint',
        ...Object.fromEntries(
          workerConfig.durable_objects.bindings.map(
            binding =>
              [binding.class_name, 'DurableObject'] satisfies [
                string,
                'DurableObject',
              ],
          ),
        ),
        ShoppingTestProvider: 'DurableObject',
      },
      miniflare: {
        compatibilityDate: workerConfig.compatibility_date,
        compatibilityFlags: workerConfig.compatibility_flags,
        bindings: workerConfig.vars,
        modulesRules: [{ type: 'CompiledWasm', include: ['**/*.wasm'] }],
        durableObjects: {
          ...Object.fromEntries(
            workerConfig.durable_objects.bindings.map(binding => [
              binding.name,
              {
                className: binding.class_name,
                useSQLite:
                  workerConfig.exports[binding.class_name]?.storage ===
                  'sqlite',
              },
            ]),
          ),
          SHOPPING_TEST_PROVIDER: {
            className: 'ShoppingTestProvider',
            useSQLite: true,
          },
        },
      },
    }),
  ],
  resolve: { alias: workerConfig.alias },
  test: {
    include: ['test/**/*.workerd.spec.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
