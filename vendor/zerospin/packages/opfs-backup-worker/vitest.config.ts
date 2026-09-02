import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.node.spec.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    conditions: ['node'],
    alias: [
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(__dirname, '../core/src')}/$1`,
      },
    ],
  },
});
