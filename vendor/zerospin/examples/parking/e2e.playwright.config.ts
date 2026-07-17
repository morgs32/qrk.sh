import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');
const parkingAppRoot = __dirname;

loadEnv({ path: path.join(parkingAppRoot, '.env.e2e'), override: true });
loadEnv({ path: path.join(parkingAppRoot, '.env.local') });
loadEnv({ path: path.join(parkingAppRoot, '.env') });

if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects: [
    {
      name: 'auth',
      testMatch: /parkingAuth\.playwright\.spec\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: /parkingAuth\.playwright\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(parkingAppRoot, '.playwright/.clerk/user.json'),
      },
      dependencies: ['auth'],
    },
  ],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3011',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm nx run parking:e2e-app',
    cwd: repoRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_CLAIM_INSPECTION: '1',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://localhost:3011',
  },
  workers: 1,
});
