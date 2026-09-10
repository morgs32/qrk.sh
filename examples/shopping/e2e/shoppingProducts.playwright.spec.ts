import { clerk } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { newWebSocketRpcSession } from 'capnweb';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { shopperV2 } from '@/zerospin/aggregates/shopper/shopperV2';
import { appV1 } from '@/zerospin/services/app/appV1';
import { signature } from '@/zerospin/signature';

const WebV2 = makeFrontendController({
  systemName: 'shopping',
  aggregateName: shopperV2.name,
  aggregateVersion: shopperV2.version,
  name: 'web',
  models: shopperV2.models,
  contracts: shopperV2.contracts,
});
const CatalogV1 = appV1.frontends.catalog.controller;

const shopperAggregateFrontendLock =
  makeFrontendControllerSpec(WebV2).aggregateFrontendLock;
const catalogServiceFrontendLock =
  makeFrontendControllerSpec(CatalogV1).serviceFrontendLock;
const authenticationLock = makeAuthenticationLock(signature);

test('signed-in e2e user can read products through the service-owned catalog frontend', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await clerk.loaded({ page });
  await expect(page).not.toHaveURL(/\/signin/);

  const clerkUserId = await page.evaluate(() => window.Clerk?.user?.id ?? null);
  if (clerkUserId === null) {
    throw new Error('The authenticated browser did not expose a Clerk user ID');
  }

  const apiUrl = process.env.ZEROSPIN_API_URL;
  if (!apiUrl) {
    throw new Error('Set ZEROSPIN_API_URL for shopping e2e.');
  }
  const apiWebSocketUrl = new URL(apiUrl);
  if (apiWebSocketUrl.protocol === 'http:') {
    apiWebSocketUrl.protocol = 'ws:';
  } else if (apiWebSocketUrl.protocol === 'https:') {
    apiWebSocketUrl.protocol = 'wss:';
  } else {
    throw new Error(
      `Unsupported Zerospin API URL protocol: ${apiWebSocketUrl.protocol}`,
    );
  }

  const publishableKey = process.env.ZEROSPIN_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('Set ZEROSPIN_PUBLISHABLE_KEY for shopping e2e.');
  }

  await expect(async () => {
    const telemetryCollector = makeTelemetryCollector();
    using gatewayApi = newWebSocketRpcSession<GatewayApi>(apiWebSocketUrl.href);
    const aggregateFrontendApi = await gatewayApi.getAggregateFrontendApi({
      publishableKey,
      systemName: WebV2.systemName,
      authenticationLock,
      signature: { clerkUserId },
      aggregateId: 'acct_1',
      aggregateName: WebV2.aggregateName,
      aggregateVersion: WebV2.aggregateVersion,
      frontendName: 'web',
      aggregateFrontendLock: shopperAggregateFrontendLock,
    });
    const aggregateState = await Effect.runPromise(
      makeTraceableApiTarget(aggregateFrontendApi)
        .getState({ outstandingCommandIds: [] })
        .pipe(Effect.provide(makeTelemetryLayer(telemetryCollector))),
    );
    expect(aggregateState.userId).toBe(clerkUserId);

    const serviceFrontendApi = await gatewayApi.getServiceFrontendApi({
      publishableKey,
      systemName: CatalogV1.systemName,
      authenticationLock,
      signature: { clerkUserId },
      serviceName: 'app',
      serviceVersion: '1.0.0',
      frontendName: 'catalog',
      serviceFrontendLock: catalogServiceFrontendLock,
    });

    const productFrontendApi = makeTraceableApiTarget(serviceFrontendApi);

    const productRows = await Effect.runPromise(
      productFrontendApi.getState().pipe(
        Effect.withSpan('shoppingProducts.getServiceFrontendState', {
          root: true,
        }),
        Effect.provide(makeTelemetryLayer(telemetryCollector)),
      ),
    );

    expect(productRows.serviceName).toBe('app');
    expect(productRows.userId).toBe(clerkUserId);
    expect(productRows.frontendName).toBe('catalog');
    expect(productRows.resources).toEqual(expect.any(Array));
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });
});
