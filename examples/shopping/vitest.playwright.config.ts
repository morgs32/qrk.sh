/// <reference types="node" />
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePlaywrightVitestConfig } from '@zerospin/dev-worker/vitest/makePlaywrightVitestConfig';
import { mergeConfig } from 'vitest/config';

import {
  startAdverseFixture,
  stopAdverseFixture,
} from './tests/browser/adverse-fixture/adverseFixtureGlobalSetup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  makePlaywrightVitestConfig({
    include: [
      'tests/browser/frontendSessionLocators.playwright.spec.ts',
      'tests/browser/mainThreadFrontendFlow.playwright.spec.ts',
      'tests/browser/mainThreadOpfsAdverse.playwright.spec.ts',
    ],
    packageRoot: __dirname,
  }),
  {
    assetsInclude: ['**/*.wasm'],
    plugins: [
      {
        name: 'qualify-static-emscripten-wasm-assets',
        enforce: 'pre',
        resolveId(id: string) {
          if (
            id === 'virtual:zerospin-sync-wasm-url' ||
            id === 'virtual:zerospin-opfs-backup-wasm-url'
          ) {
            return `\0${id}`;
          }
          return undefined;
        },
        load(id: string) {
          if (id === '\0virtual:zerospin-sync-wasm-url') {
            return `export default ${JSON.stringify(
              `data:application/octet-stream;base64,${readFileSync(
                path.resolve(
                  __dirname,
                  '../../packages/react/dist/wa-sqlite.wasm',
                ),
              ).toString('base64')}`,
            )};`;
          }
          if (id === '\0virtual:zerospin-opfs-backup-wasm-url') {
            return `export default ${JSON.stringify(
              `data:application/octet-stream;base64,${readFileSync(
                path.resolve(
                  __dirname,
                  '../../packages/opfs-backup-worker/dist/wa-sqlite.wasm',
                ),
              ).toString('base64')}`,
            )};`;
          }
          return undefined;
        },
        transform(code: string, id: string) {
          // Vitest's browser server creates a second Vite 8 environment. Its
          // built-in WASM fallback runs before an absolute WASM request can be
          // represented as a URL module, so keep the static URL out of that
          // module graph and point Emscripten directly at Vite's file route.
          if (
            id ===
            path.resolve(
              __dirname,
              '../../packages/opfs-backup-worker/dist/acquireOpfsBackupWorker/acquireOpfsBackupWorker.js',
            )
          ) {
            return code.replace(
              "new URL('../wa-sqlite.wasm', import.meta.url)",
              "new URL('/__zerospin_test_wasm__/unused', location.origin)",
            );
          }

          if (
            id ===
              path.resolve(
                __dirname,
                '../../packages/opfs-backup-worker/dist/opfsBackupLeader.bundle.js',
              ) ||
            id.startsWith(
              `${path.resolve(
                __dirname,
                '../../packages/opfs-backup-worker/dist/opfsBackupLeader.bundle.js',
              )}?`,
            )
          ) {
            return `import zerospinOpfsBackupWasmUrl from 'virtual:zerospin-opfs-backup-wasm-url';\n${code
              .replace(
                'new URL("wa-sqlite.wasm", import.meta.url)',
                'new URL(zerospinOpfsBackupWasmUrl, location.origin)',
              )
              .replace(
                'var wasmUrl = workerUrl.searchParams.get("wasmUrl");',
                'var wasmUrl = zerospinOpfsBackupWasmUrl;',
              )}`;
          }

          if (
            id.endsWith('/@livestore/wa-sqlite/dist/wa-sqlite.mjs') ||
            id.includes('/@livestore/wa-sqlite/dist/wa-sqlite.mjs?') ||
            id.endsWith('/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js') ||
            id.includes('/@livestore_wa-sqlite_dist_wa-sqlite__mjs.js?')
          ) {
            return `import zerospinSyncWasmUrl from 'virtual:zerospin-sync-wasm-url';\n${code.replace(
              /new URL\("[^"]*wa-sqlite\.wasm",\s*import\.meta\.url\)\.href/,
              'zerospinSyncWasmUrl',
            )}`;
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
          find: '@zerospin/opfs-backup-worker',
          replacement: path.resolve(
            __dirname,
            '../../packages/opfs-backup-worker/dist/index.js',
          ),
        },
      ],
    },
    optimizeDeps: {
      exclude: [
        '@livestore/wa-sqlite',
        '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
      ],
      entries: [
        'tests/browser/frontendSessionLocators.playwright.spec.ts',
        'tests/browser/mainThreadFrontendFlow.playwright.spec.ts',
        'tests/browser/mainThreadOpfsAdverse.playwright.spec.ts',
      ],
    },
    test: {
      fileParallelism: false,
      browser: {
        commands: {
          startAdverseFixture: () => startAdverseFixture(),
          stopAdverseFixture: () => stopAdverseFixture(),
        },
      },
      globalSetup: [
        './tests/browser/adverse-fixture/adverseFixtureGlobalSetup.ts',
      ],
    },
  },
);
