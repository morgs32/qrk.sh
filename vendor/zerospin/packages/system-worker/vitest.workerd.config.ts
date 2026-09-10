import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');
const drizzleOrmRoot = path.join(__dirname, 'node_modules/drizzle-orm');

export default defineConfig({
  root: __dirname,
  resolve: {
    conditions: ['workerd'],
    alias: [
      {
        find: /^capnweb$/,
        replacement: path.join(
          __dirname,
          'node_modules/capnweb/dist/index-workers.js',
        ),
      },
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement: `${path.join(repoRoot, 'packages/core/src')}/$1`,
      },
      {
        find: /^drizzle-orm\/(.+)$/,
        replacement: `${drizzleOrmRoot}/$1`,
      },
      { find: /^drizzle-orm$/, replacement: `${drizzleOrmRoot}/index.js` },
      { find: 'internal', replacement: path.resolve(__dirname, 'src') },
      {
        find: 'system',
        replacement: path.resolve(__dirname, 'src/fixtures/system.ts'),
      },
    ],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: path.join(__dirname, 'wrangler.vitest.jsonc') },
    }),
  ],
  ssr: { noExternal: ['drizzle-orm'] },
  test: {
    include: ['src/**/*.workerd.spec.ts'],
    setupFiles: ['./src/workerd-utils/acceptSystemSpec.ts'],
    isolate: true,
    maxWorkers: 1,
    passWithNoTests: false,
    testTimeout: 300_000,
    deps: {
      optimizer: {
        ssr: { enabled: true, include: ['drizzle-orm'] },
      },
    },
  },
});
