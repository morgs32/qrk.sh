import { expect, test } from '@playwright/test';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableApiTarget,
} from '@zerospin/logger';
import { Effect } from 'effect';

test('signed-in e2e user can query products through the standalone shopper api', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await expect(page).not.toHaveURL(/\/signin/);

  const sessionInspectionResponse = await page.request.get(
    '/api/e2e/session-inspection',
  );

  expect(
    sessionInspectionResponse.status(),
    'session-inspection must be enabled by PLAYWRIGHT_CLAIM_INSPECTION',
  ).not.toBe(404);
  expect(
    sessionInspectionResponse.ok(),
    `session-inspection status ${sessionInspectionResponse.status()}`,
  ).toBe(true);

  const sessionInspectionBody: unknown = await sessionInspectionResponse.json();
  expect(
    typeof sessionInspectionBody === 'object' &&
      sessionInspectionBody !== null &&
      'userId' in sessionInspectionBody,
    'session-inspection response must include userId',
  ).toBe(true);

  if (
    typeof sessionInspectionBody !== 'object' ||
    sessionInspectionBody === null ||
    !('userId' in sessionInspectionBody)
  ) {
    throw new Error('session-inspection response did not include userId');
  }

  const clerkUserId = sessionInspectionBody.userId;
  expect(typeof clerkUserId, 'session-inspection userId must be a string').toBe(
    'string',
  );

  if (typeof clerkUserId !== 'string') {
    throw new Error('session-inspection userId was not a string');
  }

  const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
  if (!apiUrl) {
    throw new Error('Set NEXT_PUBLIC_ZEROSPIN_API_URL for shopping e2e.');
  }

  const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error(
      'Set NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY for shopping e2e.',
    );
  }

  await expect(async () => {
    const telemetryCollector = makeTelemetryCollector();
    using actorApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const actorFrontendApi = makeTraceableApiTarget(
      actorApis.getFrontendApi({
        publishableKey,
        accountName: 'user',
        actorName: 'shopper',
        frontendName: 'web',
        signature: {
          clerkUserId,
        },
      }),
    );

    const actorResult = await Effect.runPromise(
      actorFrontendApi.fetchActor().pipe(
        Effect.withSpan('shoppingProducts.fetchActor', { root: true }),
        Effect.provide(makeTelemetryLayer(telemetryCollector)),
      ),
    );

    expect(actorResult.systemEnvironmentId).toBe('dev');
    expect(actorResult.actor.actorId).toBe(prefixActorId(clerkUserId));

    using productApis = newSyncRpcSession<ZerospinApis>(apiUrl);
    const productFrontendApi = makeTraceableApiTarget(
      productApis.getFrontendApi({
        publishableKey,
        accountName: 'user',
        actorName: 'shopper',
        frontendName: 'web',
        signature: {
          clerkUserId,
        },
      }),
    );

    const productRows = await Effect.runPromise(
      productFrontendApi
        .executeActorQuery({
          queryName: 'getProducts',
          params: {},
        })
        .pipe(
          Effect.withSpan('shoppingProducts.executeActorQuery', {
            root: true,
          }),
          Effect.provide(makeTelemetryLayer(telemetryCollector)),
        ),
    );

    expect(productRows).toEqual(expect.any(Array));
  }).toPass({
    intervals: [1_000, 2_000, 5_000],
    timeout: 30_000,
  });
});
