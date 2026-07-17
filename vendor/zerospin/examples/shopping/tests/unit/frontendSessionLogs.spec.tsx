// @vitest-environment jsdom

import { act } from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { ZerospinDevtools } from '@zerospin/devtools/ZerospinDevtools';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeStaticApiKeyIdentityResolver } from '@zerospin/dispatch-worker/makeStaticApiKeyIdentityResolver';
import { makeDispatchRuntime } from '@zerospin/dispatch-worker/makeDispatchRuntime';
import { SystemWorkerResolver } from '@zerospin/dispatch-worker/SystemWorkerResolver/SystemWorkerResolver';
import { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis/ZerospinApis';
import { ZerospinError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTraceableApiTarget,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { Effect, Either, Layer } from 'effect';
import { createRoot } from 'react-dom/client';
import type { SystemWorker } from 'system-worker';
import { describe, expect, it, vi } from 'vitest';

import { shopperFrontend } from '@/zerospin/frontend';

describe('frontend session logs integration', () => {
  it('links persisted server roots into one browser session and renders them in DevTools', async () => {
    const persistedBatches: ITelemetryBatch[] = [];
    const systemWorker: SystemWorker & Disposable = Object.create(null);
    systemWorker[Symbol.dispose] = vi.fn();
    systemWorker.authenticate = vi.fn<SystemWorker['authenticate']>(async () =>
      encodeRight({ accountId: 'acct_1', actorId: 'actr_logs' }),
    );
    systemWorker.authorize = vi.fn<SystemWorker['authorize']>(async () =>
      encodeRight(undefined),
    );
    systemWorker.getSystemSpec = vi.fn<SystemWorker['getSystemSpec']>(
      async () =>
        encodeRight({
          systemName: 'shopping',
          version: '1.0.0',
          services: {},
        }),
    );
    systemWorker.executeActorQuery = vi.fn<
      SystemWorker['executeActorQuery']
    >(async () =>
      encodeLeft(
        new ZerospinError({
          code: 'integration-query-failed',
          message: 'Expected actor query failure',
        }),
      ),
    );
    systemWorker.appendTelemetryBatch = vi.fn<
      SystemWorker['appendTelemetryBatch']
    >(async props => {
      persistedBatches.push(props.batch);
      return encodeRight(undefined);
    });

    const runtime = makeDispatchRuntime({
      apiKeyIdentityResolver: makeStaticApiKeyIdentityResolver({
        systemId: 'sys_shopping',
        keyType: 'publishable',
      }),
      systemWorkerResolver: Layer.succeed(SystemWorkerResolver, {
        get: () => systemWorker,
      }),
    });
    const apis = new ZerospinApis({
      deployId: 'dpl_test',
      generationId: 'gen_test',
      runtime,
    });
    const frontendApi = await apis.getFrontendApi({
      publishableKey: 'pk_logs',
      accountName: shopperFrontend.accountName,
      actorName: shopperFrontend.actorName,
      frontendName: shopperFrontend.frontendName,
      signature: { clerkUserId: 'user_logs' },
    });
    const session = makeSession({
      frontend: shopperFrontend,
      generateSignature: () =>
        Effect.succeed({ clerkUserId: 'user_logs' }),
      sessionId: 'sesn_frontend_logs',
    });
    const otherSession = makeSession({
      frontend: shopperFrontend,
      generateSignature: () =>
        Effect.succeed({ clerkUserId: 'user_logs' }),
      sessionId: 'sesn_other_frontend_logs',
    });
    const tracedFrontendApi = makeTraceableApiTarget(frontendApi);

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const actor = yield* tracedFrontendApi.fetchActor().pipe(
          Effect.withSpan('browser.fetchActor'),
        );
        const failedQuery = yield* tracedFrontendApi
          .executeActorQuery({
            queryName: 'missing-query',
            params: {},
          })
          .pipe(
            Effect.withSpan('browser.executeActorQuery'),
            Effect.either,
          );
        return { actor, failedQuery };
      }).pipe(
        Effect.provide(
          makeTelemetryLayer(
            session.store.getState().telemetryCollector,
          ),
        ),
      ),
    );

    expect(outcome.actor.actor.actorId).toBe('actr_logs');
    expect(Either.isLeft(outcome.failedQuery)).toBe(true);
    if (Either.isLeft(outcome.failedQuery)) {
      expect(outcome.failedQuery.left).toEqual(
        expect.objectContaining({ code: 'integration-query-failed' }),
      );
    }
    expect(persistedBatches).toHaveLength(2);
    expect(session.store.getState().telemetry.links).toHaveLength(2);
    expect(session.store.getState().telemetry.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'browser.fetchActor' }),
        expect.objectContaining({
          name: 'browser.executeActorQuery',
          status: 'error',
        }),
      ]),
    );
    const browserFetchSpan = session.store
      .getState()
      .telemetry.spans.find(span => span.name === 'browser.fetchActor');
    const browserQuerySpan = session.store
      .getState()
      .telemetry.spans.find(
        span => span.name === 'browser.executeActorQuery',
      );
    const serverFetchRoot = persistedBatches[0]?.spans.find(
      span => span.name === 'FrontendApi.fetchActor',
    );
    const serverQueryRoot = persistedBatches[1]?.spans.find(
      span => span.name === 'FrontendApi.executeActorQuery',
    );
    expect(session.store.getState().telemetry.links[0]).toEqual(
      expect.objectContaining({
        traceId: serverFetchRoot?.traceId,
        spanId: serverFetchRoot?.spanId,
        priorTraceId: browserFetchSpan?.traceId,
        priorSpanId: browserFetchSpan?.spanId,
      }),
    );
    expect(session.store.getState().telemetry.links[1]).toEqual(
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
      accountId: 'acct_1',
      accountName: shopperFrontend.accountName,
      actorId: 'actr_logs',
      generationId: 'gen_test',
      systemVersion: '1.0.0',
      systemWorkerName: 'sys_shopping:dev:user_logs',
      db,
      schema: dbConfig.schema,
      models,
      vfsName: null,
      isInitialized: true,
      frontendIndex: null,
      lastRebasedPushedCursor: null,
      isPushPaused: true,
    });
    const emptyPushResult = {
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    };
    let completeManualPush = () => {};
    const pushStagedCommands = vi.fn(
      () =>
        new Promise<typeof emptyPushResult>(resolve => {
          completeManualPush = () => {
            session.store.getState().telemetryCollector.addSpan({
              spanId: 'spn_devtools_manual_push',
              traceId: 'trc_devtools_manual_push',
              parentSpanId: null,
              name: 'devtools.pushStagedCommands',
              status: 'ok',
              startedAt: 1_757_789_723_400,
              endedAt: 1_757_789_723_456,
              attributes: null,
            });
            session.store.setState({
              lastDevtoolsPush: {
                traceId: 'trc_devtools_manual_push',
                completedAt: 1_757_789_723_456,
                status: 'ok',
              },
            });
            resolve(emptyPushResult);
          };
        }),
    );
    Reflect.apply(zerospinDevtoolsStore.getState().addSession, null, [
      { session, pushStagedCommands },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ZerospinDevtools
          config={{
            defaultOpen: true,
            requireUrlFlag: false,
            triggerHidden: true,
          }}
        />,
      );
      await Promise.resolve();
    });

    const logsTab = await vi.waitFor(() => {
      const tab = document.querySelector<HTMLAnchorElement>(
        'a[href$="/logs"]',
      );
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

    await act(async () => {
      await session.stageCommand({
        contractName: 'createCart',
        payload: {
          id: 'crt_logs',
          userId: 'usr_logs',
        },
      });
    });

    const pushButton = await vi.waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Push staged commands"]',
      );
      expect(button?.disabled).toBe(false);
      return button;
    });

    await act(async () => {
      pushButton?.click();
      await Promise.resolve();
    });
    expect(pushButton?.textContent).toBe('Pushing…');
    expect(pushButton?.disabled).toBe(true);

    await act(async () => {
      completeManualPush();
      await Promise.resolve();
    });

    const manualPushLink = await vi.waitFor(() => {
      const link = document.querySelector<HTMLAnchorElement>(
        'a[href*="traceId=trc_devtools_manual_push"]',
      );
      expect(link?.textContent).toContain('Pushed at ');
      expect(link?.title).toBe('2025-09-13T18:55:23.456Z');
      return link;
    });
    await act(async () => {
      manualPushLink?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-testid="selected-trace"]')?.textContent,
      ).toContain('trc_devtools_manual_push');
    });

    const clearTelemetryButton = document.querySelector<HTMLButtonElement>(
      'button[data-testid="clear-session-telemetry"]',
    );
    await act(async () => {
      clearTelemetryButton?.click();
      await Promise.resolve();
    });
    expect(session.store.getState().lastDevtoolsPush).toBeNull();
    expect(
      document.querySelector('a[href*="traceId=trc_devtools_manual_push"]'),
    ).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    zerospinDevtoolsStore.getState().removeSession(session.sessionId);
    await runtime.dispose();
  });
});
