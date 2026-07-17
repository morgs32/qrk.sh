/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makePlaywrightVitestConfig } from '@zerospin/dispatch-worker/vitest/makePlaywrightVitestConfig';
import { mergeConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  makePlaywrightVitestConfig({
    include: ['tests/browser/reactAndSharedWorkerFlow1.playwright.spec.ts'],
    packageRoot: __dirname,
  }),
  {
    optimizeDeps: {
      include: [
        'wa-sqlite',
        'wa-sqlite/dist/wa-sqlite-async.mjs',
        'wa-sqlite/src/examples/IDBBatchAtomicVFS.js',
      ],
    },
  },
);
