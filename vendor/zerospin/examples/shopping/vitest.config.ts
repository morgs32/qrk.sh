import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: {
    'import.meta.env.VITE_ZEROSPIN_API_URL': JSON.stringify(
      'https://api.example.test',
    ),
    'import.meta.env.VITE_ZEROSPIN_PUBLISHABLE_KEY': JSON.stringify('pk_test'),
  },
  plugins: [react(), VitePWA({ injectRegister: false })],
  resolve: {
    conditions: ['node'],
    alias: [
      {
        find: 'cloudflare:workers',
        replacement: path.resolve(__dirname, 'tests/unit/cloudflareWorkers.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      {
        find: 'internal',
        replacement: path.resolve(__dirname, '../../packages/core/src'),
      },
      {
        find: 'system',
        replacement: path.resolve(__dirname, 'src/zerospin/system.ts'),
      },
      {
        find: '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
        replacement: '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
      },
    ],
  },
  ssr: {
    noExternal: ['system-worker', 'partyserver'],
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
    passWithNoTests: false,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
  },
});
