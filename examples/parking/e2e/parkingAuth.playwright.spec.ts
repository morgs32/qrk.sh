import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import { config } from 'dotenv';

setup.describe.configure({ mode: 'serial' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parkingAppRoot = path.join(__dirname, '..');

config({ path: path.join(parkingAppRoot, '.env.local') });
config({ path: path.join(parkingAppRoot, '.env') });

if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

setup('auth', async () => {
  await clerkSetup();
});

const authFile = path.join(parkingAppRoot, '.playwright/.clerk/user.json');

setup('authenticate and save state to storage', async ({ page }) => {
  const identifier = process.env.E2E_USER_EMAIL;
  if (!identifier) {
    throw new Error(
      'Set E2E_USER_EMAIL in parking/.env.local for authenticated e2e.',
    );
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error(
      'Set CLERK_SECRET_KEY in parking/.env.local for Clerk email-based testing sign-in.',
    );
  }
  if (!process.env.CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or CLERK_PUBLISHABLE_KEY in parking/.env.local for authenticated e2e.',
    );
  }

  await page.goto('/signin');
  await clerk.signIn({
    page,
    emailAddress: identifier,
  });
  await page.waitForFunction(() => window.Clerk?.session !== null);
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Zerospin Parking', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });
  await page
    .getByRole('heading', { level: 2, name: 'Provider View', exact: true })
    .waitFor({ state: 'visible', timeout: 15_000 });

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
