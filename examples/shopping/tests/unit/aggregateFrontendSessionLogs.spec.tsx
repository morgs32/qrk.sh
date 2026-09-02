// @vitest-environment jsdom

import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinDevtools } from '@zerospin/devtools/ZerospinDevtools';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTraceableApiTarget,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { Effect, Result, Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';
import { describe, expect, it, vi } from 'vitest';

import { web as shopperFrontend } from '@/zerospin/frontends/web';
import { ClerkUserIdSchema, User } from '@/zerospin/models/User';
import { system } from '@/zerospin/system';

describe('aggregate frontend session logs integration', () => {
  it('links persisted server roots into one browser session and renders them in DevTools', async () => {
    const clerkUserId =
      Schema.decodeUnknownSync(ClerkUserIdSchema)('user_logs');
    const persistedBatches: ITelemetryBatch[] = [];
    const frontendSpec = makeFrontendControllerSpec(shopperFrontend);
    const authenticationLock = makeAuthenticationLock({
      signature: system.authentication.signature,
    });
    Reflect.set(env, 'MATERIALIZED_AGGREGATE_REPO', {
      getByName: () => ({
        authorizeAggregateFrontend: async () => encodeSuccess(undefined),
      }),
    });
    Reflect.set(env, 'MATERIALIZED_SERVICE_REPO', {
      getByName: () => ({
        executeServiceQuery: async () =>
          encodeFailure(
            new ZerospinError({
              code: 'integration-query-failed',
              message: 'Expected aggregate query failure',
            }),
          ),
      }),
    });
    Reflect.set(env, 'SYSTEM_LOG_REPO', {
      getByName: () => ({
        appendTelemetryBatch: async (props: { batch: ITelemetryBatch }) => {
          persistedBatches.push(props.batch);
          return encodeSuccess(undefined);
        },
      }),
    });

    const runtime = makeSystemRuntime();
    const gatewayApi = new GatewayApi({
      runtime,
    });
    const aggregateFrontendApi = await gatewayApi.getAggregateFrontendApi({
      publishableKey: 'pk_logs',
      systemName: shopperFrontend.systemName,
      authenticationLock,
      signature: { clerkUserId: 'user_logs' },
      aggregateId: 'acct_1',
      aggregateName: shopperFrontend.aggregateName,
      frontendName: shopperFrontend.frontendName,
      aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
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
            queryName: 'getProducts',
            params: {},
          })
          .pipe(
            Effect.withSpan('browser.executeAggregateQuery'),
            Effect.result,
          );
        return { failedQuery };
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(session.store.getState().telemetryCollector),
        ),
      ),
    );

    expect(Result.isFailure(outcome.failedQuery)).toBe(true);
    if (Result.isFailure(outcome.failedQuery)) {
      expect(outcome.failedQuery.failure).toEqual(
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
      makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
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
      isInitialized: true,
      frontendIndex: 0,
      sessionStatus: 'current',
      backupState: { status: 'ready', failure: null },
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
      {
        session,
        getPushPaused: async () => ({ _tag: 'Success', success: false }),
        setPushPaused: async () => ({
          _tag: 'Success',
          success: undefined,
        }),
        pushNow: async () => ({
          _tag: 'Success',
          success: { status: 'empty' },
        }),
      },
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
