import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  onUnhandledError(error) {
    if (
      error instanceof Error &&
      error.message.includes(
        'Durable Object reset because its code was updated',
      )
    ) {
      return false;
    }
  },
  root: __dirname,
  resolve: {
    alias: {
      '@zerospin/logger': path.join(__dirname, 'src/index.ts'),
    },
    conditions: ['workerd'],
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: path.join(__dirname, 'wrangler.vitest.jsonc'),
      },
    }),
  ],
  test: {
    include: ['specs/workerd/**/*.workerd.spec.ts'],
    isolate: true,
    maxWorkers: 1,
    passWithNoTests: false,
    testTimeout: 120_000,
  },
});
