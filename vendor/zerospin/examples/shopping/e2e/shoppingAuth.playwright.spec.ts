import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { config } from 'dotenv';
import { Effect, Schema } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { Product } from '@/zerospin/models';
import { seeds } from '@/zerospin/seeds';

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

  const apiUrl = process.env.ZEROSPIN_API_URL;
  if (!apiUrl) {
    throw new Error('Set ZEROSPIN_API_URL for shopping e2e.');
  }
  const zerospinSecretKey = process.env.ZEROSPIN_SECRET_KEY;
  if (!zerospinSecretKey) {
    throw new Error('Set ZEROSPIN_SECRET_KEY for shopping e2e.');
  }

  await expect(async () => {
    const telemetryCollector = makeTelemetryCollector();
    let shouldSeedProducts = false;
    {
      using gatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
      const querySystemApi = makeTraceableApiTarget(
        gatewayApi.getSystemApi({ zerospinSecretKey }),
      );
      const currentProducts = await Effect.runPromise(
        querySystemApi
          .executeServiceQuery({
            serviceName: 'app',
            queryName: 'getProducts',
            params: {},
          })
          .pipe(
            Effect.flatMap(
              Schema.encodeUnknown(Schema.Array(Product.resourceSchema)),
            ),
            Effect.withSpan('shoppingAuth.executeServiceQuery', {
              root: true,
            }),
            Effect.provide(makeTelemetryLayer(telemetryCollector)),
          ),
      );
      shouldSeedProducts = !currentProducts.some(
        product => product.name === 'Basic T-Shirt',
      );
    }
    if (shouldSeedProducts) {
      const seedCommands = await Effect.runPromise(
        seeds.pipe(Effect.provide(NanoIdFactory)),
      );
      const serviceSeedCommands = seedCommands.filter(
        command => command.commandType === 'service',
      );
      const encodedServiceSeedCommands = await Effect.runPromise(
        Effect.forEach(serviceSeedCommands, command =>
          Schema.encode(Schema.parseJson(Schema.Unknown))(command.payload).pipe(
            Effect.map(payload => ({ ...command, payload })),
          ),
        ),
      );
      using seedGatewayApi = newSyncRpcSession<GatewayApi>(apiUrl);
      const seedSystemApi = makeTraceableApiTarget(
        seedGatewayApi.getSystemApi({ zerospinSecretKey }),
      );
      const seedResult = await Effect.runPromise(
        seedSystemApi
          .finalizeServiceCommands({
            serviceName: 'app',
            commands: encodedServiceSeedCommands,
          })
          .pipe(
            Effect.withSpan('shoppingAuth.finalizeServiceCommands', {
              root: true,
            }),
            Effect.provide(makeTelemetryLayer(telemetryCollector)),
          ),
      );
      expect(seedResult.failed).toEqual([]);
    }
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });

  await page.goto('/signin');
  await clerk.signIn({
    page,
    emailAddress: identifier,
  });
  await page.waitForFunction(() => window.Clerk?.session !== null);
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Zerospin Shopping', exact: true })
    .waitFor({ state: 'visible', timeout: 90_000 });
  await page
    .getByRole('heading', { level: 2, name: 'Products', exact: true })
    .waitFor({ state: 'visible', timeout: 90_000 });

  await mkdir(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
