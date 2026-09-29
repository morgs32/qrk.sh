import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    include: ['src/**/*.react.spec.tsx'],
  },
});
