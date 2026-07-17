import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');
const wranglerVitestPath = path.join(__dirname, 'wrangler.vitest.jsonc');

export default defineConfig({
  root: __dirname,
  resolve: {
    conditions: ['workerd'],
    alias: [
      {
        find: /^@zerospin\/sync$/,
        replacement: path.join(__dirname, 'src/index.ts'),
      },
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
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: wranglerVitestPath,
      },
    }),
  ],
  test: {
    include: ['e2e/**/*.workerd.spec.ts'],
    isolate: true,
    maxWorkers: 1,
    passWithNoTests: true,
    setupFiles: [path.join(__dirname, 'vitest.workerd.setup.ts')],
    testTimeout: 120_000,
  },
});
