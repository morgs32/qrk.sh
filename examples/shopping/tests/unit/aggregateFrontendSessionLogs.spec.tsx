// @vitest-environment jsdom

import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { makeStaticApiKeyIdentityResolver } from '@zerospin/dev-worker/makeStaticApiKeyIdentityResolver';
import { ZerospinDevtools } from '@zerospin/devtools/ZerospinDevtools';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTraceableApiTarget,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { Effect, Either, Layer, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import type { SystemWorker } from 'system-worker';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';
import { SystemWorkerResolver } from 'system-worker/SystemWorkerResolver/SystemWorkerResolver';
import { describe, expect, it, vi } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';
import { ClerkUserIdSchema, User } from '@/zerospin/models';
import { system } from '@/zerospin/system';

vi.mock(
  '../../../../packages/system-worker/src/SystemRepo/SystemRepo.js',
  () => ({
    SystemRepo: {
      getRepo: vi.fn(() => {
        throw new Error(
          'aggregate frontend session logs integration does not exercise current-write routing',
        );
      }),
    },
  }),
);

describe('aggregate frontend session logs integration', () => {
  it('links persisted server roots into one browser session and renders them in DevTools', async () => {
    const clerkUserId =
      Schema.decodeUnknownSync(ClerkUserIdSchema)('user_logs');
    const persistedBatches: ITelemetryBatch[] = [];
    const frontendSpec = makeFrontendControllerSpec(shopperFrontend);
    const authenticationLock = Effect.runSync(
      makeAuthenticationLock({ signature: system.authentication.signature }),
    );
    const systemWorker: SystemWorker & Disposable = Object.create(null);
    systemWorker[Symbol.dispose] = vi.fn();
    systemWorker.authenticate = vi.fn<SystemWorker['authenticate']>(async () =>
      encodeRight({
        authenticationLock,
        userId: clerkUserId,
        systemName: system.name,
        systemVersion: system.version,
      }),
    );
    systemWorker.authorizeAggregateFrontend = vi.fn<
      SystemWorker['authorizeAggregateFrontend']
    >(async () =>
      encodeRight({
        actorRef: {
          aggregateId: 'acct_1',
          aggregateName: shopperFrontend.aggregateName,
          userId: clerkUserId,
        },
        aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
        frontendSpec,
        systemVersion: system.version,
      }),
    );
    systemWorker.executeAggregateQuery = vi.fn<
      SystemWorker['executeAggregateQuery']
    >(async () =>
      encodeLeft(
        new ZerospinError({
          code: 'integration-query-failed',
          message: 'Expected aggregate query failure',
        }),
      ),
    );
    systemWorker.appendTelemetryBatch = vi.fn<
      SystemWorker['appendTelemetryBatch']
    >(async props => {
      persistedBatches.push(props.batch);
      return encodeRight(undefined);
    });

    const apiKeyIdentityResolver = makeStaticApiKeyIdentityResolver({
      systemId: 'sys_shopping',
      keyType: 'publishable',
    });
    const runtime = makeSystemRuntime({
      systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
        get: () => systemWorker,
      }),
    });
    const gatewayApi = new GatewayApi({
      apiKeyIdentityResolver,
      environment: 'dev',
      runtime,
      systemRepo: {
        getActiveGenerationId: vi.fn(async () => encodeRight('gen_test')),
        getDeploy: vi.fn(async () => {
          throw new Error(
            'aggregate frontend session logs does not read deploys',
          );
        }),
        getReadiness: vi.fn(async () => {
          throw new Error(
            'aggregate frontend session logs does not read readiness',
          );
        }),
        startDeploy: vi.fn(async () => {
          throw new Error(
            'aggregate frontend session logs does not request deploys',
          );
        }),
      },
    });
    const authenticatedApi = await gatewayApi.getAuthenticatedApi({
      publishableKey: 'pk_logs',
      authenticationLock,
      signature: { clerkUserId: 'user_logs' },
    });
    expect(
      await Effect.runPromise(
        decodeRpc(await authenticatedApi.getAuthentication()),
      ),
    ).toMatchObject({
      systemId: 'sys_shopping',
      userId: clerkUserId,
    });
    const aggregateFrontendApi = await authenticatedApi.getAggregateFrontendApi(
      {
        aggregateId: 'acct_1',
        aggregateName: shopperFrontend.aggregateName,
        frontendName: shopperFrontend.frontendName,
        aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
      },
    );
    expect(
      await Effect.runPromise(
        decodeRpc(await aggregateFrontendApi.getAdmission()),
      ),
    ).toMatchObject({
      actorRef: {
        aggregateId: 'acct_1',
        aggregateName: shopperFrontend.aggregateName,
        userId: clerkUserId,
      },
      systemId: 'sys_shopping',
    });
    const session = makeSession({
      frontend: shopperFrontend,
      sessionId: 'sesn_aggregate_frontend_logs',
    });
    const otherSession = makeSession({
      frontend: shopperFrontend,
      sessionId: 'sesn_other_aggregate_frontend_logs',
    });
    const tracedAggregateFrontendApi =
      makeTraceableApiTarget(aggregateFrontendApi);

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const failedQuery = yield* tracedAggregateFrontendApi
          .executeAggregateQuery({
            queryName: 'missing-query',
            params: {},
          })
          .pipe(
            Effect.withSpan('browser.executeAggregateQuery'),
            Effect.either,
          );
        return { failedQuery };
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(session.store.getState().telemetryCollector),
        ),
      ),
    );

    expect(Either.isLeft(outcome.failedQuery)).toBe(true);
    if (Either.isLeft(outcome.failedQuery)) {
      expect(outcome.failedQuery.left).toEqual(
        expect.objectContaining({ code: 'integration-query-failed' }),
      );
    }
    expect(persistedBatches).toHaveLength(1);
    expect(session.store.getState().telemetry.links).toHaveLength(1);
    expect(session.store.getState().telemetry.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'browser.executeAggregateQuery',
          status: 'error',
        }),
      ]),
    );
    const browserQuerySpan = session.store
      .getState()
      .telemetry.spans.find(
        span => span.name === 'browser.executeAggregateQuery',
      );
    const serverQueryRoot = persistedBatches[0]?.spans.find(
      span => span.name === 'AggregateFrontendApi.executeAggregateQuery',
    );
    expect(session.store.getState().telemetry.links[0]).toEqual(
      expect.objectContaining({
        traceId: serverQueryRoot?.traceId,
        spanId: serverQueryRoot?.spanId,
        priorTraceId: browserQuerySpan?.traceId,
        priorSpanId: browserQuerySpan?.spanId,
      }),
    );
    expect(otherSession.store.getState().telemetry).toEqual(
      emptyTelemetryBatch(),
    );

    const models = getFrontendDbModels(session.frontend);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
    });
    const db = await Effect.runPromise(
      makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    session.store.setState({
      aggregateId: 'acct_1',
      aggregateName: shopperFrontend.aggregateName,
      userId: 'user_logs',
      systemId: 'sys_shopping',
      systemVersion: system.version,
      frontendName: shopperFrontend.frontendName,
      db,
      schema: dbConfig.schema,
      models,
      vfsName: null,
      isInitialized: true,
      frontendIndex: 0,
      replicaIndex: null,
      lastRebasedPushedCursor: null,
    });
    const seededAt = new Date('2025-09-13T18:55:23.000Z');
    db.insert(dbConfig.schema.user)
      .values({
        id: 'usr_logs',
        modelName: User.modelName,
        createdAt: seededAt,
        updatedAt: seededAt,
        version: User.version,
        clerkUserId,
        name: null,
      })
      .run();
    Reflect.apply(zerospinDevtoolsStore.getState().addAggregateSession, null, [
      { session },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ZerospinDevtools
          config={{
            defaultOpen: true,
            triggerHidden: true,
          }}
        />,
      );
      await Promise.resolve();
    });

    const logsTab = await vi.waitFor(() => {
      const tab = document.querySelector<HTMLAnchorElement>('a[href$="/logs"]');
      expect(tab).not.toBeNull();
      return tab;
    });
    await act(async () => {
      logsTab?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-testid="selected-trace"]'),
      ).not.toBeNull();
      expect(document.body.textContent).toContain('Copy server trace ID');
      expect(document.body.textContent).toContain(
        session.store.getState().telemetry.links.at(-1)?.traceId,
      );
    });

    const clearTelemetryButton = document.querySelector<HTMLButtonElement>(
      'button[data-testid="clear-session-telemetry"]',
    );
    await act(async () => {
      clearTelemetryButton?.click();
      await Promise.resolve();
    });
    expect(session.store.getState().telemetry.spans).toEqual([]);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    zerospinDevtoolsStore.getState().removeAggregateSession(session.sessionId);
    await runtime.dispose();
  });
});
