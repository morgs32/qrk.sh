import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');
const wranglerVitestPath = path.join(__dirname, 'wrangler.vitest.jsonc');
const sqlJsAsmPath = path.join(
  __dirname,
  'node_modules/sql.js/dist/sql-asm.js',
);
const drizzleOrmRoot = path.join(__dirname, 'node_modules/drizzle-orm');

export default defineConfig({
  root: __dirname,
  resolve: {
    conditions: ['workerd'],
    alias: [
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(repoRoot, 'packages/core/src')}/$1`,
      },
      {
        find: /^drizzle-orm\/(.+)$/,
        replacement: `${drizzleOrmRoot}/$1`,
      },
      {
        find: /^drizzle-orm$/,
        replacement: `${drizzleOrmRoot}/index.js`,
      },
      {
        find: /^sql\.js$/,
        replacement: sqlJsAsmPath,
      },
      {
        find: 'internal',
        replacement: path.resolve(__dirname, 'src'),
      },
      {
        find: 'system',
        replacement: path.resolve(__dirname, 'src/fixtures/system.ts'),
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
  ssr: {
    noExternal: ['drizzle-orm'],
  },
  test: {
    include: ['src/**/*.workerd.spec.ts'],
    isolate: true,
    maxWorkers: 1,
    passWithNoTests: true,
    testTimeout: 300_000,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['drizzle-orm'],
        },
      },
    },
  },
});
