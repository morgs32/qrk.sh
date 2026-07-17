import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@zerospin\/core\/(.+)$/,
        replacement:
          fileURLToPath(new URL('../core/src/', import.meta.url)) + '$1',
      },
      {
        find: '@livestore/wa-sqlite/dist/wa-sqlite.mjs',
        replacement: fileURLToPath(
          new URL(
            '../core/node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
            import.meta.url,
          ),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.node.spec.ts'],
  },
});
