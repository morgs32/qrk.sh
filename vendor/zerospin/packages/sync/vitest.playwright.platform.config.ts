import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const dispatchUrl = process.env.ZEROSPIN_SYNC_DISPATCH_URL?.trim();
if (dispatchUrl === undefined || dispatchUrl === '') {
  throw new Error(
    'Missing ZEROSPIN_SYNC_DISPATCH_URL. Deploy sync-dispatch and sync-fixture (see packages/sync/README.md), then export the dispatch worker URL.',
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');

export default defineConfig({
  root: __dirname,
  resolve: {
    conditions: ['node'],
    alias: [
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(repoRoot, 'packages/core/src')}/$1`,
      },
      {
        find: /^@zerospin\/error$/,
        replacement: path.join(repoRoot, 'packages/error/src/index.ts'),
      },
    ],
  },
  optimizeDeps: {
    include: [
      'agents/react',
      'capnweb',
      'effect',
      'react',
      'react/jsx-dev-runtime',
      'vitest-browser-react',
    ],
  },
  define: {
    __TEST_WORKER_URL__: JSON.stringify(dispatchUrl.replace(/\/$/, '')),
    'globalThis.IS_REACT_ACT_ENVIRONMENT': true,
  },
  test: {
    include: ['e2e/**/*.platform.playwright.spec.{ts,tsx}'],
    retry: 3,
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
          headless: true,
        },
      ],
      provider: playwright(),
    },
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
