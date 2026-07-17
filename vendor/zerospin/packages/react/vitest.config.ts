import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { config as loadEnv } from 'dotenv';
import { defineConfig, defineProject } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Later paths only fill vars missing from earlier files */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });
loadEnv({ path: path.join(__dirname, '.env.test') });

/** Vitest workspaces do not merge parent `resolve`; mirror aliases on each project. */
const resolveAlias = {
  conditions: ['node'],
  alias: [
    {
      find: /^@zerospin\/core\/(.+)$/,
      replacement: `${path.join(__dirname, '../core/src')}/$1`,
    },
    {
      find: '@zerospin/core',
      replacement: path.join(__dirname, '../core/src'),
    },
    {
      find: 'internal',
      replacement: path.resolve(__dirname, 'src'),
    },
    {
      find: 'system',
      replacement: path.resolve(__dirname, 'src/fixtures/system.ts'),
    },
    {
      find: '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
      replacement: path.resolve(
        __dirname,
        '../core/node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
      ),
    },
  ],
};

export default defineConfig({
  test: {
    projects: [
      defineProject({
        root: __dirname,
        resolve: resolveAlias,
        test: {
          name: 'core-node',
          environment: 'node',
          globals: true,
          include: ['src/**/*.node.spec.ts'],
        },
      }),
      defineProject({
        root: __dirname,
        resolve: resolveAlias,
        plugins: [react()],
        test: {
          name: 'core-react',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          testTimeout: 120_000,
          include: ['src/**/*.react.spec.ts', 'src/**/*.react.spec.tsx'],
        },
      }),
    ],
  },
});
