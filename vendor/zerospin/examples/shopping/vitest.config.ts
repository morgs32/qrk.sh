import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['node'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        find: 'internal',
        replacement: path.resolve(__dirname, '../../packages/core/src'),
      },
      {
        find: '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
        replacement: '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
      },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      'tests/e2e/**',
      '**/*.workerd.spec.ts',
    ],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
