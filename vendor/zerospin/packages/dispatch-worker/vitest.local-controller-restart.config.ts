import { defineConfig } from 'vitest/config';

// This Node test must own both sequential Wrangler processes itself. The
// Workers pool cannot retain one persistence directory across pool restarts.
export default defineConfig({
  test: {
    include: ['tests/node/DevZerospinApis.restart-persistence.node.spec.ts'],
    maxWorkers: 1,
    testTimeout: 300_000,
  },
});
