import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ['node'],
    alias: {
      internal: path.resolve(__dirname, '../core/src'),
    },
  },
  test: {
    environment: 'node',
    // Jiti and Vitest must share core's canonical class identities.
    server: {
      deps: {
        // Transform the RPC adapter so tests can replace its transport.
        inline: [
          /\/packages\/core\/dist\/utils\/getApi\/(getApi|newSyncRpcSession\/newSyncRpcSession)\.js$/,
        ],
        external: [
          /\/packages\/core\/(?!dist\/utils\/getApi\/(?:getApi|newSyncRpcSession\/newSyncRpcSession)\.js$)/,
        ],
      },
    },
    exclude: ['src/**/*.integration.spec.ts'],
    include: ['src/**/*.spec.ts'],
  },
});
