import { readFileSync } from 'node:fs';
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
  plugins: [
    react(),
    VitePWA({ injectRegister: false }),
    {
      name: 'worker-snapshot-wasm-in-node',
      enforce: 'pre',
      resolveId(source) {
        return source.endsWith('/sql-wasm.wasm') ? '\0shopping-sql-wasm' : null;
      },
      load(id) {
        if (id !== '\0shopping-sql-wasm') return null;
        const bytes = readFileSync(
          path.resolve(
            __dirname,
            '../../packages/system-worker/node_modules/sql.js/dist/sql-wasm.wasm',
          ),
        );
        return `export default new WebAssembly.Module(Uint8Array.from(Buffer.from('${bytes.toString('base64')}', 'base64')))`;
      },
    },
  ],
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
        find: 'config',
        replacement: path.resolve(__dirname, 'zerospin.config.ts'),
      },
      {
        find: '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
        replacement: '@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
      },
    ],
  },
  ssr: {
    noExternal: ['system-worker', 'partyserver', 'sql.js'],
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
