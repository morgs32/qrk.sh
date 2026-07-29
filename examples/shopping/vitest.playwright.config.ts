/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePlaywrightVitestConfig } from '@zerospin/dispatch-worker/vitest/makePlaywrightVitestConfig';
import { mergeConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  makePlaywrightVitestConfig({
    include: [
      'tests/browser/reactAndSharedWorkerFlow1.playwright.spec.ts',
      'tests/browser/reactSharedWorkerAdverse.playwright.spec.ts',
      'tests/browser/reactDirectAndUnavailable.playwright.spec.ts',
    ],
    packageRoot: __dirname,
  }),
  {
    assetsInclude: ['**/*.wasm'],
    plugins: [
      {
        name: 'qualify-static-emscripten-wasm-assets',
        enforce: 'pre',
        transform(code: string, id: string) {
          // Vitest's browser server creates a second Vite 8 environment. Its
          // built-in WASM fallback runs before an absolute WASM request can be
          // represented as a URL module, so keep the static URL out of that
          // module graph and point Emscripten directly at Vite's file route.
          if (
            id ===
            path.resolve(
              __dirname,
              '../../packages/shared-worker/dist/makeSharedWorkerSession.js',
            )
          ) {
            return code.replace(
              "new URL('./wa-sqlite-async.wasm', import.meta.url)",
              `new URL(${JSON.stringify(
                `/@fs${path.resolve(
                  __dirname,
                  '../../packages/shared-worker/dist/wa-sqlite-async.wasm',
                )}`,
              )}, location.origin)`,
            );
          }

          if (
            id ===
              path.resolve(
                __dirname,
                '../../packages/shared-worker/dist/sharedWorker.bundle.js',
              ) ||
            id.startsWith(
              `${path.resolve(
                __dirname,
                '../../packages/shared-worker/dist/sharedWorker.bundle.js',
              )}?`,
            )
          ) {
            return code.replace(
              'new URL("wa-sqlite-async.wasm", import.meta.url)',
              `new URL(${JSON.stringify(
                `/@fs${path.resolve(
                  __dirname,
                  '../../packages/shared-worker/dist/wa-sqlite-async.wasm',
                )}`,
              )}, location.origin)`,
            );
          }

          if (
            id.endsWith(
              '/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js',
            ) ||
            id.includes(
              '/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js?',
            )
          ) {
            return code.replace(
              /new URL\("[^"]*\/@livestore\/wa-sqlite\/dist\/wa-sqlite\.wasm", import\.meta\.url\)/,
              `new URL(${JSON.stringify(
                `/@fs${path.resolve(
                  __dirname,
                  '../../packages/react/dist/wa-sqlite.wasm',
                )}`,
              )}, location.origin)`,
            );
          }

          if (
            id.endsWith('/wa-sqlite_dist_wa-sqlite-async__mjs.js') ||
            id.includes('/wa-sqlite_dist_wa-sqlite-async__mjs.js?')
          ) {
            return code.replace(
              /new URL\("[^"]*\/wa-sqlite\/dist\/wa-sqlite-async\.wasm", import\.meta\.url\)/,
              `new URL(${JSON.stringify(
                `/@fs${path.resolve(
                __dirname,
                '../../packages/shared-worker/dist/wa-sqlite-async.wasm',
                )}`,
              )}, location.origin)`,
            );
          }

          return undefined;
        },
      },
    ],
    define: {
      'process.env': {},
    },
    resolve: {
      alias: [
        {
          find: '@zerospin/shared-worker/makeSharedWorkerSession',
          replacement: path.resolve(
            __dirname,
            '../../packages/shared-worker/dist/makeSharedWorkerSession.js',
          ),
        },
      ],
    },
    server: {
      proxy: {
        '/__zerospin': {
          target: 'http://127.0.0.1:3035',
        },
      },
    },
    optimizeDeps: {
      include: [
        'wa-sqlite',
        'wa-sqlite/dist/wa-sqlite-async.mjs',
        'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
      ],
    },
    test: {
      globalSetup: [
        './tests/browser/adverse-fixture/adverseFixtureGlobalSetup.ts',
      ],
    },
  },
);
