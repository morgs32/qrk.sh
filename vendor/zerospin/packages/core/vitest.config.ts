import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  alias: {
    internal: path.resolve(__dirname, 'src'),
    system: path.resolve(__dirname, 'src/fixtures/system.ts'),
    '@livestore/wa-sqlite/dist/wa-sqlite.mjs': path.resolve(
      __dirname,
      'node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
    ),
  },
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
    ],
  },
});
