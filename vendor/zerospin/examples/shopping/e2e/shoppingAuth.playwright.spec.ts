import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { config } from 'dotenv';

setup.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shoppingAppRoot = path.join(__dirname, '..');

config({ path: path.join(shoppingAppRoot, '.env.local') });
config({ path: path.join(shoppingAppRoot, '.env') });

if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.VITE_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
}

setup('auth', async () => {
  await clerkSetup();
});

const authFile = path.join(shoppingAppRoot, '.playwright/.clerk/user.json');

setup('authenticate and save state to storage', async ({ page }) => {
  setup.setTimeout(120_000);
  const identifier = process.env.E2E_USER_EMAIL;
  if (!identifier) {
    throw new Error(
      'Set E2E_USER_EMAIL in shopping/.env.local for authenticated e2e.',
    );
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error(
      'Set CLERK_SECRET_KEY in shopping/.env.local (required for Clerk email-based testing sign-in).',
    );
  }
  if (!process.env.CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Set VITE_CLERK_PUBLISHABLE_KEY in shopping/.env.local for authenticated e2e.',
    );
  }

  await page.goto('/signin');
  await clerk.signIn({
    page,
    emailAddress: identifier,
  });
  await page.waitForFunction(() => window.Clerk?.session !== null);

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
