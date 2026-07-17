import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shoppingAppRoot = __dirname;

loadEnv({ path: path.join(shoppingAppRoot, '.env.e2e'), override: true });
loadEnv({ path: path.join(shoppingAppRoot, '.env.local') });
loadEnv({ path: path.join(shoppingAppRoot, '.env') });

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: './e2e',
  testMatch: /.*\.e2e\.spec\.ts/,
  workers: 1,
});
