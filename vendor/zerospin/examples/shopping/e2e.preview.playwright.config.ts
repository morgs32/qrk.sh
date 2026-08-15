import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '../..');

loadEnv({ path: path.join(__dirname, '.env.e2e'), override: true });
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  testMatch: /.*\.preview\.spec\.ts/,
  use: {
    baseURL: 'http://localhost:3011',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'nx run shopping:preview',
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://localhost:3011/signin',
  },
  workers: 1,
});
