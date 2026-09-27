import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shoppingAppRoot = __dirname;

loadEnv({ path: path.join(shoppingAppRoot, '.env.e2e'), override: true });
loadEnv({ path: path.join(shoppingAppRoot, '.env.local') });
loadEnv({ path: path.join(shoppingAppRoot, '.env') });

if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.VITE_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  globalSetup: path.join(__dirname, 'e2e/shoppingGlobalSetup.ts'),
  projects: [
    {
      name: 'auth',
      testMatch: /shoppingAuth\.playwright\.spec\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /shoppingHome\.playwright\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(
          shoppingAppRoot,
          '.playwright/.clerk/user.json',
        ),
      },
      dependencies: ['auth'],
    },
  ],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3010',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: './node_modules/.bin/zerospin dev --clean --port 3005',
      cwd: shoppingAppRoot,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3005/__zerospin/ready',
    },
    {
      command: './node_modules/.bin/vite --port 3010',
      cwd: shoppingAppRoot,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      reuseExistingServer: false,
      timeout: 120_000,
      url: 'http://localhost:3010',
    },
  ],
  workers: 1,
});
