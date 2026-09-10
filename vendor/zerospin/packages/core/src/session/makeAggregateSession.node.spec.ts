import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { main, mainModels, User } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import type { InferFrontendModels } from '@zerospin/core/frontendController/types';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '@zerospin/core/session/sessionRepoTables';
import type {
  IInitializedSessionState,
  ISession,
  ISessionId,
} from '@zerospin/core/session/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import {
  emptyTelemetryBatch,
  type ILogRecord,
  type ISpanRecord,
} from '@zerospin/logger';
import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { decodeRpc } from '../utils/decodeRpc.ts';

import { applyAggregateFrontendCommand } from './applyAggregateFrontendCommand.ts';
import { applyAggregateFrontendState } from './applyAggregateFrontendState.ts';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const sessionScope = Scope.makeUnsafe();
Effect.runSync(
  Scope.addFinalizer(sessionScope, guardTestRuntime.disposeEffect),
);
afterAll(() => Effect.runPromise(Scope.close(sessionScope, Exit.void)));

const frontend = makeFrontendController({
  aggregateVersion: '1.0.0',
  contracts: {},
  models: {},
  aggregateName: 'user',
  name: 'web',
  systemName: 'make-session-push-queue-test',
});

describe('makeAggregateSession telemetry', () => {
  it('keeps ordered telemetry isolated per session without deduplication', () => {
    const first = Effect.runSync(
      Effect.map(frontend.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend,
          sessionId: 'sesn_telemetry_1',
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
    const second = Effect.runSync(
      Effect.map(frontend.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend,
          sessionId: 'sesn_telemetry_2',
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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
    const session = Effect.runSync(
      Effect.map(frontend.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend,
          sessionId: 'sesn_telemetry_clear',
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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
  const db = await Effect.runPromise(
    makeProvisionedInMemoryWasmSqliteDb({ dbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  return { db, schema: dbConfig.schema };
}

function publishInitializedState(props: {
  session: ISession<typeof main>;
  deps: Awaited<ReturnType<typeof makeInitializedSessionDeps>>;
}) {
  const { deps, session } = props;
  session.store.setState({
    sessionId: session.sessionId,
    aggregateId: 'acct_1',
    aggregateName: main.aggregateName,
    userId: 'usr_1',
    systemId: 'sys_test',
    frontendName: main.name,
    aggregateFrontendLockKey: 'aggregate-lock-key',
    db: deps.db,
    schema: deps.schema,
    models: mainModels,
    isInitialized: true,
    userIndex: 0,
    sessionStatus: 'current',
    backupState: { status: 'ready', failure: null },
  });
}

describe('makeAggregateSession onInitialized', () => {
  it('delivers the initialized state to a pending handler once in the next microtask', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = Effect.runSync(
      Effect.map(main.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: main,
          sessionId: 'sesn_1' as ISessionId,
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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

    session.store.setState({ userIndex: 1 });
    await Promise.resolve();
    expect(deliveries).toHaveLength(1);
  });

  it('invokes a handler registered after initialization synchronously', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = Effect.runSync(
      Effect.map(main.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: main,
          sessionId: 'sesn_2' as ISessionId,
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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
    const session = Effect.runSync(
      Effect.map(main.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: main,
          sessionId: 'sesn_3' as ISessionId,
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
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

describe('renewable execution identity', () => {
  it('keeps the session and store while new commands restart their index under the renewed identity', async () => {
    const deps = await makeInitializedSessionDeps();
    const session = Effect.runSync(
      Effect.map(main.initializeGuards, guards =>
        makeAggregateSession({
          runtime: guardTestRuntime,
          guards,
          frontend: main,
          sessionId: 'sesn_before_handoff',
        }),
      ).pipe(Effect.provideService(Scope.Scope, sessionScope)),
    );
    const store = session.store;
    publishInitializedState({ session, deps });
    store.setState({ aggregateIndex: 0, pushIndex: 0 });
    deps.db
      .insert(deps.schema.user)
      .values({
        id: 'usr_1',
        modelName: User.modelName,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        version: User.version,
        name: 'User',
      })
      .run();
    const first = await Effect.runPromise(
      decodeRpc(
        session.executeCommand({
          contractName: 'createList',
          payload: {
            id: 'lst_before_handoff',
            name: 'Before',
            userId: 'usr_1',
          },
        }),
      ),
    );
    const originalJournal = deps.db
      .select()
      .from(sessionCommandJournalDrizzleSchema)
      .all();

    store.setState({ sessionStatus: 'superseded' });
    expect(
      session.executeCommand({
        contractName: 'createList',
        payload: { id: 'lst_paused', name: 'Paused', userId: 'usr_1' },
      }),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-frontend-session-not-current' },
    });
    store.setState({
      sessionId: 'sesn_after_handoff',
      sessionStatus: 'current',
    });
    const second = await Effect.runPromise(
      decodeRpc(
        session.executeCommand({
          contractName: 'createList',
          payload: { id: 'lst_after_handoff', name: 'After', userId: 'usr_1' },
        }),
      ),
    );

    expect(session.store).toBe(store);
    expect(store.getState().db).toBe(deps.db);
    expect(session.sessionId).toBe('sesn_after_handoff');
    expect(first).toMatchObject({
      sessionId: 'sesn_before_handoff',
      sessionIndex: 1,
    });
    expect(second).toMatchObject({
      sessionId: 'sesn_after_handoff',
      sessionIndex: 1,
    });
    expect(
      deps.db.select().from(sessionCommandJournalDrizzleSchema).all(),
    ).toEqual([
      ...originalJournal,
      expect.objectContaining({
        sessionId: 'sesn_after_handoff',
        sessionIndex: 1,
      }),
    ]);
    expect(deps.db.select().from(sessionMetadataDrizzleSchema).all()).toEqual([
      expect.objectContaining({
        sessionId: 'sesn_before_handoff',
        nextSessionIndex: 2,
      }),
      expect.objectContaining({
        sessionId: 'sesn_after_handoff',
        nextSessionIndex: 2,
      }),
    ]);

    await Effect.runPromise(
      decodeRpc(
        session.executeCommand({
          contractName: 'updateList',
          payload: {
            id: 'lst_before_handoff',
            name: 'Earlier optimistic update',
            userId: 'usr_1',
          },
        }),
      ),
    );
    store.setState({ sessionId: 'sesn_third_handoff' });
    await Effect.runPromise(
      decodeRpc(
        session.executeCommand({
          contractName: 'updateList',
          payload: {
            id: 'lst_before_handoff',
            name: 'Latest optimistic update',
            userId: 'usr_1',
          },
        }),
      ),
    );
    const retainedJournal = deps.db
      .select()
      .from(sessionCommandJournalDrizzleSchema)
      .all();
    const target = {
      db: deps.db,
      frontend: main,
      sessionId: session.sessionId,
      models: mainModels,
      aggregateId: 'acct_1',
      userId: 'usr_1',
      systemId: 'sys_test',
    } satisfies Omit<
      Parameters<typeof applyAggregateFrontendState<typeof main>>[0],
      'frontendState'
    >;
    await Effect.runPromise(
      applyAggregateFrontendState({
        ...target,
        frontendState: {
          aggregateId: target.aggregateId,
          aggregateName: main.aggregateName,
          userId: target.userId,
          systemId: target.systemId,
          frontendName: main.name,
          aggregateVersion: '1.0.0',
          aggregateIndex: 0,
          userIndex: 0,
          resolutions: [],
          resources: deps.db.select().from(deps.schema.user).all(),
        },
      }),
    );
    expect(deps.db.select().from(deps.schema.list).all()[0]?.name).toBe(
      'Latest optimistic update',
    );
    await Effect.runPromise(
      applyAggregateFrontendCommand({
        ...target,
        command: {
          userIndex: 1,
          aggregateIndex: 0,
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          resolution: null,
        },
      }),
    );
    expect(deps.db.select().from(deps.schema.list).all()[0]?.name).toBe(
      'Latest optimistic update',
    );
    expect(
      deps.db.select().from(sessionCommandJournalDrizzleSchema).all(),
    ).toEqual(retainedJournal);
  });
});
