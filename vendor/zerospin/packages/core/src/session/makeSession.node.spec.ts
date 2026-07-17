import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { main, mainModels } from '@zerospin/core/fixtures/system';
import type { InferFrontendModels } from '@zerospin/core/frontendController/types';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type {
  IInitializedSessionState,
  ISession,
  ISessionId,
} from '@zerospin/core/session/types';
import {
  emptyTelemetryBatch,
  type ILogRecord,
  type ISpanRecord,
} from '@zerospin/logger';
import { Effect } from 'effect';
import { describe, expect, vi } from 'vitest';

const frontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'make-session-push-queue-test',
  signature: {},
});

describe('makeSession configuration', () => {
  it('initializes push and shared worker flags', () => {
    const defaultSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_1' as ISessionId,
    });
    const configuredSession = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_2' as ISessionId,
      isPushPaused: true,
      isSharedWorkerEnabled: true,
    });

    expect(defaultSession.store.getState().isPushPaused).toBe(false);
    expect(defaultSession.store.getState().isSharedWorkerEnabled).toBe(false);
    expect(defaultSession.store.getState().lastDevtoolsPush).toBeNull();
    expect(configuredSession.store.getState().isPushPaused).toBe(true);
    expect(configuredSession.store.getState().isSharedWorkerEnabled).toBe(true);
  });

  it('stores the exact signature factory without invoking it', () => {
    const generateSignature = vi.fn(() =>
      Effect.succeed({ actorId: 'usr_1' }),
    );
    const session = makeSession({
      frontend,
      generateSignature,
      sessionId: 'sesn_signature_factory',
    });

    expect(session.generateSignature).toBe(generateSignature);
    expect(generateSignature).not.toHaveBeenCalled();
  });
});

describe('makeSession telemetry', () => {
  it('keeps ordered telemetry isolated per session without deduplication', () => {
    const first = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_telemetry_1',
    });
    const second = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_telemetry_2',
    });
    const span: ISpanRecord = {
      spanId: 'spn_1',
      traceId: 'trc_1',
      parentSpanId: null,
      name: 'first span',
      status: 'ok',
      startedAt: 1,
      endedAt: 2,
      attributes: null,
    };
    const log: ILogRecord = {
      logId: 'lgr_1',
      createdAt: 3,
      level: 'info',
      message: 'first log',
      source: 'test',
      payload: null,
      traceId: 'trc_1',
      spanId: 'spn_1',
    };

    first.store.getState().telemetryCollector.addSpan(span);
    first.store.getState().telemetryCollector.addLog(log);
    first.store.getState().telemetryCollector.addSpan(span);

    expect(first.store.getState().telemetry.spans).toEqual([span, span]);
    expect(first.store.getState().telemetry.logs).toEqual([log]);
    expect(second.store.getState().telemetry).toEqual(emptyTelemetryBatch());
  });

  it('clears the current batch and accepts later in-flight completion', () => {
    const session = makeSession({
      frontend,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_telemetry_clear',
    });
    const collector = session.store.getState().telemetryCollector;
    const firstLog: ILogRecord = {
      logId: 'lgr_before_clear',
      createdAt: 1,
      level: 'info',
      message: 'before clear',
      source: 'test',
      payload: null,
      traceId: null,
      spanId: null,
    };
    const laterLog: ILogRecord = {
      logId: 'lgr_after_clear',
      createdAt: 2,
      level: 'info',
      message: 'after clear',
      source: 'test',
      payload: null,
      traceId: null,
      spanId: null,
    };

    collector.addLog(firstLog);
    session.store.setState({ telemetry: emptyTelemetryBatch() });
    collector.addLog(laterLog);

    expect(session.store.getState().telemetry.logs).toEqual([laterLog]);
    expect(session.store.getState().telemetryCollector).toBe(collector);
  });
});

async function makeInitializedSessionDeps() {
  const dbConfig = makeResourceDbConfig({
    models: mainModels,
    otherTables: sessionRepoTables,
  });
  const { schema } = dbConfig;
  const db = await Effect.runPromise(
    makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  return { db, schema };
}

function publishInitializedState(props: {
  session: ISession<typeof main>;
  deps: Awaited<ReturnType<typeof makeInitializedSessionDeps>>;
}) {
  const { deps, session } = props;
  session.store.setState({
    sessionId: session.sessionId,
    accountId: 'acct_1',
    accountName: main.accountName,
    actorId: 'usr_1',
    generationId: 'gen_test',
    systemWorkerName: 'stub-deploy',
    systemVersion: '1.0.0',
    db: deps.db,
    schema: deps.schema,
    models: mainModels,
    vfsName: null,
    isInitialized: true,
    frontendIndex: null,
    lastRebasedPushedCursor: null,
  });
}

describe('makeSession onInitialized', () => {
  it('delivers the initialized state to a pending handler once in the next microtask', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = makeSession({
      frontend: main,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_1' as ISessionId,
    });
    const deliveries: IInitializedSessionState<
      InferFrontendModels<typeof main>
    >[] = [];

    session.onInitialized(({ state }) => {
      deliveries.push(state);
    });

    publishInitializedState({ session, deps });
    expect(deliveries).toHaveLength(0);

    await Promise.resolve();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.isInitialized).toBe(true);
    expect(deliveries[0]?.db).toBe(deps.db);

    session.store.setState({ isPushPaused: true });
    await Promise.resolve();
    expect(deliveries).toHaveLength(1);
  });

  it('invokes a handler registered after initialization synchronously', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = makeSession({
      frontend: main,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_2' as ISessionId,
    });
    publishInitializedState({ session, deps });

    const deliveries: IInitializedSessionState<
      InferFrontendModels<typeof main>
    >[] = [];
    session.onInitialized(({ state }) => {
      deliveries.push(state);
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.db).toBe(deps.db);
  });

  it('does not deliver after unsubscribe before initialization', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = makeSession({
      frontend: main,
      generateSignature: () => Effect.succeed({ actorId: 'usr_1' }),
      sessionId: 'sesn_3' as ISessionId,
    });
    const deliveries: IInitializedSessionState<
      InferFrontendModels<typeof main>
    >[] = [];

    const unsubscribe = session.onInitialized(({ state }) => {
      deliveries.push(state);
    });
    unsubscribe();

    publishInitializedState({ session, deps });
    await Promise.resolve();
    await Promise.resolve();
    expect(deliveries).toHaveLength(0);
  });
});
