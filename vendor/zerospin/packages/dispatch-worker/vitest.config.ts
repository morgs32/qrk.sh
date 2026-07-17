import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.node.spec.ts'],
  },
});
