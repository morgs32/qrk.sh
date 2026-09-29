import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './vitest.config.workerd-system.ts',
      './vitest.config.workerd-machine.ts',
    ],
  },
});
