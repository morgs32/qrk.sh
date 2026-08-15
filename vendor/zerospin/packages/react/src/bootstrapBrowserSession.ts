import type { Async } from '@zerospin/core/async/Async';
import type {
  IEncodedAggregateFrontendMutation,
  IEncodedCommand,
  IStagedSessionCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type { IAggregateFrontendController } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { applyAggregateFrontendReplicaBlock } from '@zerospin/core/session/applyAggregateFrontendReplicaBlock';
import { applyAggregateFrontendReplicaState } from '@zerospin/core/session/applyAggregateFrontendReplicaState';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type {
  IAggregateFrontendReplicaBlock,
  ISession,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import type { TelemetryCollector } from '@zerospin/logger';
import type { UserPartitionRepo } from '@zerospin/shared-worker/acquireUserPartitionRepo';
import { Effect, Runtime } from 'effect';

import { AggregateFrontendReplicaSink } from './AggregateFrontendReplicaSink/AggregateFrontendReplicaSink';

export const bootstrapBrowserSession = Effect.fn('bootstrapBrowserSession')(
  function* <FRONTEND extends IAggregateFrontendController>(props: {
    session: ISession<FRONTEND>;
    aggregateId: IAggregateId;
    userId: string;
    systemId: ISystemId;
    mode: 'online' | 'existing-only';
    userReplicaApi: UserPartitionRepo;
  }): Effect.fn.Return<
    {
      stageAggregateFrontendCommand: (stageProps: {
        sessionIndex: number;
        command: IEncodedCommand<IStagedSessionCommand>;
        mutations: readonly IEncodedAggregateFrontendMutation[];
      }) => Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
      releaseBrowserSession: Effect.Effect<void>;
    },
    IAnyError,
    Async | CuidFactory | TelemetryCollector
  > {
    const { aggregateId, session, systemId, userId, userReplicaApi } = props;
    const frontend = session.frontend;
    const runtime = yield* Effect.runtime<
      Async | CuidFactory | TelemetryCollector
    >();
    const completeFrontendSpec = makeFrontendControllerSpec(frontend);
    const frontendSpec = {
      ...completeFrontendSpec,
      models: Object.fromEntries(
        Object.entries(completeFrontendSpec.models).map(([key, model]) => [
          key,
          { ...model, historicalDefinitions: [] },
        ]),
      ),
      contracts: Object.fromEntries(
        Object.entries(completeFrontendSpec.contracts).map(
          ([key, contract]) => [
            key,
            { ...contract, historicalDefinitions: [] },
          ],
        ),
      ),
    };
    const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
      frontendSpec.aggregateFrontendLock,
    );
    let acquisitionMode = props.mode;

    session.store.setState({
      workerState: {
        mode: 'shared-worker',
        status: 'hydrating',
        bootstrapSource: null,
        frontendIndex: null,
        replicaIndex: null,
        databaseName: null,
        failure: null,
      },
    });
    const models = getFrontendDbModels(frontend);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
    });
    const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
    let isDatabaseClosed = false;
    let isBrowserSessionReleased = false;
    let isFailed = false;
    let failure: IAnyErrorJson | null = null;
    let currentFrontendIndex = 0;
    let currentReplicaIndex = 0;
    let previousReplicaBlock: IAggregateFrontendReplicaBlock | null = null;
    let transportRegainOperation: Promise<void> | null = null;
    let handleTransportRegain: (() => void) | null = null;

    const closeDatabase = Effect.tryPromise({
      try: async () => {
        if (isDatabaseClosed) return;
        isDatabaseClosed = true;
        await db.$client.sqlite3.close(db.$client.db);
      },
      catch: ZerospinError.catch({
        code: 'aggregate-frontend-session-database-close-failed',
        message: 'Failed to close aggregate frontend session database',
      }),
    }).pipe(Effect.ignore);

    const sink = new AggregateFrontendReplicaSink({
      handleBlock: frontendReplicaBlock =>
        Runtime.runPromise(runtime)(
          Effect.gen(function* () {
            if (isFailed && failure !== null) {
              return yield* new ZerospinError(failure);
            }
            const applied = yield* applyAggregateFrontendReplicaBlock({
              db,
              frontend,
              models,
              frontendReplicaBlock,
              aggregateId,
              userId,
              systemId,
              aggregateFrontendLockKey,
              currentFrontendIndex,
              currentReplicaIndex,
              previousReplicaBlock,
            }).pipe(
              Effect.tapError(() =>
                Effect.sync(() => {
                  const state = session.store.getState();
                  if (
                    state.isInitialized &&
                    state.workerState.status !== 'failed'
                  ) {
                    session.store.setState({
                      workerState: {
                        ...state.workerState,
                        status: 'repairing',
                      },
                    });
                  }
                }),
              ),
            );
            if (applied === 'duplicate') return;
            currentFrontendIndex = frontendReplicaBlock.frontendIndex;
            currentReplicaIndex = frontendReplicaBlock.replicaIndex;
            previousReplicaBlock = frontendReplicaBlock;
            const state = session.store.getState();
            if (state.isInitialized) {
              session.store.setState({
                frontendIndex: currentFrontendIndex,
                replicaIndex: currentReplicaIndex,
                workerState: {
                  ...state.workerState,
                  status:
                    frontendReplicaBlock.kind === 'server'
                      ? 'online'
                      : state.workerState.status,
                  frontendIndex: currentFrontendIndex,
                  replicaIndex: currentReplicaIndex,
                },
              });
            }
          }).pipe(encodeRpc),
        ),
      replaceState: frontendReplicaState =>
        Runtime.runPromise(runtime)(
          Effect.gen(function* () {
            if (isFailed && failure !== null) {
              return yield* new ZerospinError(failure);
            }
            yield* applyAggregateFrontendReplicaState({
              frontend,
              aggregateId,
              userId,
              systemId,
              aggregateFrontendLockKey,
              db,
              schema: dbConfig.schema,
              models,
              frontendReplicaState,
            });
            currentFrontendIndex = frontendReplicaState.frontendIndex;
            currentReplicaIndex = frontendReplicaState.replicaIndex;
            previousReplicaBlock = null;
            const state = session.store.getState();
            if (state.isInitialized) {
              session.store.setState({
                systemVersion: frontendReplicaState.systemVersion,
                frontendIndex: currentFrontendIndex,
                replicaIndex: currentReplicaIndex,
                workerState: {
                  ...state.workerState,
                  status: acquisitionMode === 'online' ? 'online' : 'offline',
                  frontendIndex: currentFrontendIndex,
                  replicaIndex: currentReplicaIndex,
                },
              });
            }
          }).pipe(encodeRpc),
        ),
      handleFailure: encodedFailure =>
        Runtime.runPromise(runtime)(
          Effect.sync(() => {
            isFailed = true;
            failure = encodedFailure;
            const state = session.store.getState();
            session.store.setState({
              workerState: {
                ...state.workerState,
                status: 'failed',
                failure: encodedFailure,
              },
            });
          }).pipe(encodeRpc),
        ),
    });

    const acquired = yield* Effect.tryPromise({
      try: () =>
        userReplicaApi.acquireAggregateFrontendReplica({
          aggregateId,
          aggregateName: frontend.aggregateName,
          frontendName: frontend.frontendName,
          aggregateFrontendLockKey,
          aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
          frontendSpec,
          mode: acquisitionMode,
          sink,
        }),
      catch: ZerospinError.catch({
        code: 'aggregate-frontend-replica-acquisition-failed',
        message: 'Failed to acquire aggregate frontend replica',
      }),
    }).pipe(
      Effect.flatMap(decodeRpc),
      Effect.tapError(() => closeDatabase),
    );
    const frontendReplicaState = yield* Effect.tryPromise({
      try: () => acquired.getState(),
      catch: ZerospinError.catch({
        code: 'aggregate-frontend-replica-state-failed',
        message: 'Failed to read acquired aggregate frontend replica',
      }),
    }).pipe(
      Effect.flatMap(decodeRpc),
      Effect.tapError(() =>
        Effect.all([
          Effect.tryPromise(() => acquired.release()).pipe(Effect.ignore),
          closeDatabase,
        ]).pipe(Effect.asVoid),
      ),
    );
    yield* applyAggregateFrontendReplicaState({
      frontend,
      aggregateId,
      userId,
      systemId,
      aggregateFrontendLockKey,
      db,
      schema: dbConfig.schema,
      models,
      frontendReplicaState,
    }).pipe(
      Effect.tapError(() =>
        Effect.all([
          Effect.tryPromise(() => acquired.release()).pipe(Effect.ignore),
          closeDatabase,
        ]).pipe(Effect.asVoid),
      ),
    );
    currentFrontendIndex = frontendReplicaState.frontendIndex;
    currentReplicaIndex = frontendReplicaState.replicaIndex;

    session.store.setState({
      sessionId: session.sessionId,
      aggregateId,
      aggregateName: frontend.aggregateName,
      userId,
      systemId,
      systemVersion: frontendReplicaState.systemVersion,
      frontendName: frontend.frontendName,
      aggregateFrontendLockKey,
      db,
      schema: dbConfig.schema,
      models,
      vfsName: null,
      isInitialized: true,
      frontendIndex: currentFrontendIndex,
      replicaIndex: currentReplicaIndex,
      workerState: {
        mode: 'shared-worker',
        status: acquisitionMode === 'online' ? 'online' : 'offline',
        bootstrapSource: 'replica',
        frontendIndex: currentFrontendIndex,
        replicaIndex: currentReplicaIndex,
        databaseName: 'replica.db',
        failure: null,
      },
    });

    if (
      acquisitionMode === 'existing-only' &&
      typeof globalThis.addEventListener === 'function'
    ) {
      handleTransportRegain = () => {
        if (
          isBrowserSessionReleased ||
          isFailed ||
          acquisitionMode === 'online' ||
          transportRegainOperation !== null
        ) {
          return;
        }
        const operation = Runtime.runPromise(runtime)(
          Effect.gen(function* () {
            const upgraded = yield* Effect.tryPromise({
              try: () =>
                userReplicaApi.acquireAggregateFrontendReplica({
                  aggregateId,
                  aggregateName: frontend.aggregateName,
                  frontendName: frontend.frontendName,
                  aggregateFrontendLockKey,
                  aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
                  frontendSpec,
                  mode: 'online',
                  sink,
                }),
              catch: ZerospinError.catch({
                code: 'aggregate-frontend-replica-reacquisition-failed',
                message:
                  'Failed to promote cached aggregate frontend replica online',
              }),
            }).pipe(Effect.flatMap(decodeRpc));
            if (isBrowserSessionReleased) {
              yield* Effect.tryPromise(() => upgraded.release()).pipe(
                Effect.ignore,
              );
              return;
            }
            const disposeUpgraded = Reflect.get(upgraded, Symbol.dispose);
            if (typeof disposeUpgraded === 'function') {
              Reflect.apply(disposeUpgraded, upgraded, []);
            }
            acquisitionMode = 'online';
            const state = session.store.getState();
            if (state.isInitialized) {
              session.store.setState({
                workerState: { ...state.workerState, status: 'online' },
              });
            }
            if (handleTransportRegain !== null) {
              globalThis.removeEventListener('online', handleTransportRegain);
              handleTransportRegain = null;
            }
          }).pipe(Effect.ignore),
        ).finally(() => {
          if (transportRegainOperation === operation) {
            transportRegainOperation = null;
          }
        });
        transportRegainOperation = operation;
      };
      globalThis.addEventListener('online', handleTransportRegain);
    }

    return {
      stageAggregateFrontendCommand: stageProps =>
        Effect.tryPromise({
          try: () =>
            userReplicaApi.stageAggregateFrontendCommand({
              target: {
                aggregateId,
                aggregateName: frontend.aggregateName,
                frontendName: frontend.frontendName,
                aggregateFrontendLockKey,
              },
              ...stageProps,
            }),
          catch: ZerospinError.catch({
            code: 'aggregate-frontend-command-stage-failed',
            message:
              'Failed to stage aggregate frontend command in SharedWorker',
          }),
        }).pipe(Effect.flatMap(decodeRpc)),
      releaseBrowserSession: Effect.gen(function* () {
        if (isBrowserSessionReleased) return;
        isBrowserSessionReleased = true;
        if (handleTransportRegain !== null) {
          globalThis.removeEventListener('online', handleTransportRegain);
          handleTransportRegain = null;
        }
        yield* Effect.tryPromise(() => acquired.release()).pipe(Effect.ignore);
        yield* closeDatabase;
        session.store.setState({
          aggregateId: null,
          aggregateName: null,
          userId: null,
          systemId: null,
          systemVersion: null,
          frontendName: null,
          aggregateFrontendLockKey: null,
          db: null,
          schema: null,
          models: null,
          vfsName: null,
          isInitialized: false,
          frontendIndex: null,
          replicaIndex: null,
          workerState: {
            mode: 'shared-worker',
            status: 'released',
            bootstrapSource: null,
            frontendIndex: null,
            replicaIndex: null,
            databaseName: null,
            failure,
          },
        });
      }),
    };
  },
);
