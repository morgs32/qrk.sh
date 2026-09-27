import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.ts',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://localhost:3020', headless: true },
  webServer: [
    {
      command: 'pnpm nx run tic-tac-toe:zerospin:dev',
      cwd: '../..',
      url: 'http://localhost:3006',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm nx run tic-tac-toe:dev',
      cwd: '../..',
      url: 'http://localhost:3020',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
