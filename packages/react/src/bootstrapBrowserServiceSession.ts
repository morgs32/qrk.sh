import type { Async } from '@zerospin/core/async/Async';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import { applyServiceFrontendReplicaBlock } from '@zerospin/core/serviceSession/applyServiceFrontendReplicaBlock';
import { applyServiceFrontendReplicaState } from '@zerospin/core/serviceSession/applyServiceFrontendReplicaState';
import type {
  IServiceFrontendReplicaBlock,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { type TelemetryCollector } from '@zerospin/logger';
import type { UserPartitionRepo } from '@zerospin/shared-worker/acquireUserPartitionRepo';
import { Effect, Runtime } from 'effect';

import { ServiceFrontendReplicaSink } from './ServiceFrontendReplicaSink/ServiceFrontendReplicaSink';

export const bootstrapBrowserServiceSession = Effect.fn(
  'bootstrapBrowserServiceSession',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  session: IServiceSession<FRONTEND>;
  userId: string;
  systemId: ISystemId;
  mode: 'online' | 'existing-only';
  userReplicaApi: UserPartitionRepo;
}): Effect.fn.Return<
  Readonly<{ releaseBrowserSession: Effect.Effect<void> }>,
  IAnyError,
  Async | TelemetryCollector
> {
  const { session, systemId, userId, userReplicaApi } = props;
  const frontend = session.frontend;
  const runtime = yield* Effect.runtime<Async | TelemetryCollector>();
  const completeFrontendSpec = makeFrontendControllerSpec(frontend);
  const frontendSpec = {
    ...completeFrontendSpec,
    models: Object.fromEntries(
      Object.entries(completeFrontendSpec.models).map(([key, model]) => [
        key,
        { ...model, historicalDefinitions: [] },
      ]),
    ),
  };
  const serviceFrontendLockKey = yield* makeServiceFrontendLockKey(
    frontendSpec.serviceFrontendLock,
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
  const dbConfig = makeResourceDbConfig<FRONTEND['models']>({
    models: frontend.models,
  });
  const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
  let isDatabaseClosed = false;
  let isBrowserSessionReleased = false;
  let isFailed = false;
  let failure: IAnyErrorJson | null = null;
  let currentFrontendIndex = 0;
  let currentReplicaIndex = 0;
  let previousReplicaBlock: IServiceFrontendReplicaBlock | null = null;
  let transportRegainOperation: Promise<void> | null = null;
  let handleTransportRegain: (() => void) | null = null;

  const closeDatabase = Effect.tryPromise({
    try: async () => {
      if (isDatabaseClosed) return;
      isDatabaseClosed = true;
      await db.$client.sqlite3.close(db.$client.db);
    },
    catch: ZerospinError.catch({
      code: 'service-frontend-session-database-close-failed',
      message: 'Failed to close service frontend session database',
    }),
  }).pipe(Effect.ignore);

  const sink = new ServiceFrontendReplicaSink({
    handleBlock: serviceFrontendReplicaBlock =>
      Runtime.runPromise(runtime)(
        Effect.gen(function* () {
          if (isFailed && failure !== null) {
            return yield* new ZerospinError(failure);
          }
          const applied = yield* applyServiceFrontendReplicaBlock({
            db,
            frontend,
            frontendReplicaBlock: serviceFrontendReplicaBlock,
            models: frontend.models,
            userId,
            systemId,
            serviceFrontendLockKey,
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
          currentFrontendIndex = serviceFrontendReplicaBlock.frontendIndex;
          currentReplicaIndex = serviceFrontendReplicaBlock.replicaIndex;
          previousReplicaBlock = serviceFrontendReplicaBlock;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
              workerState: {
                ...state.workerState,
                status: 'online',
                frontendIndex: currentFrontendIndex,
                replicaIndex: currentReplicaIndex,
              },
            });
          }
        }).pipe(encodeRpc),
      ),
    replaceState: serviceFrontendReplicaState =>
      Runtime.runPromise(runtime)(
        Effect.gen(function* () {
          if (isFailed && failure !== null) {
            return yield* new ZerospinError(failure);
          }
          yield* applyServiceFrontendReplicaState({
            frontend,
            userId,
            systemId,
            serviceFrontendLockKey,
            db,
            models: frontend.models,
            frontendReplicaState: serviceFrontendReplicaState,
          });
          currentFrontendIndex = serviceFrontendReplicaState.frontendIndex;
          currentReplicaIndex = serviceFrontendReplicaState.replicaIndex;
          previousReplicaBlock = null;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              systemVersion: serviceFrontendReplicaState.systemVersion,
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
          if (state.isInitialized) {
            session.store.setState({
              workerState: {
                ...state.workerState,
                status: 'failed',
                failure: encodedFailure,
              },
            });
          } else {
            session.store.setState({
              workerState: {
                mode: 'shared-worker',
                status: 'failed',
                bootstrapSource: null,
                frontendIndex: null,
                replicaIndex: null,
                databaseName: null,
                failure: encodedFailure,
              },
            });
          }
        }).pipe(encodeRpc),
      ),
  });

  const acquired = yield* Effect.tryPromise({
    try: () =>
      userReplicaApi.acquireServiceFrontendReplica({
        serviceName: frontend.serviceName,
        frontendName: frontend.frontendName,
        serviceFrontendLockKey,
        serviceFrontendLock: frontendSpec.serviceFrontendLock,
        frontendSpec,
        mode: acquisitionMode,
        sink,
      }),
    catch: ZerospinError.catch({
      code: 'service-frontend-replica-acquisition-failed',
      message: 'Failed to acquire service frontend replica',
    }),
  }).pipe(
    Effect.flatMap(decodeRpc),
    Effect.tapError(() => closeDatabase),
  );
  const serviceFrontendReplicaState = yield* Effect.tryPromise({
    try: () => acquired.getState(),
    catch: ZerospinError.catch({
      code: 'service-frontend-replica-state-failed',
      message: 'Failed to read acquired service frontend replica',
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
  yield* applyServiceFrontendReplicaState({
    frontend,
    userId,
    systemId,
    serviceFrontendLockKey,
    db,
    models: frontend.models,
    frontendReplicaState: serviceFrontendReplicaState,
  }).pipe(
    Effect.tapError(() =>
      Effect.all([
        Effect.tryPromise(() => acquired.release()).pipe(Effect.ignore),
        closeDatabase,
      ]).pipe(Effect.asVoid),
    ),
  );
  currentFrontendIndex = serviceFrontendReplicaState.frontendIndex;
  currentReplicaIndex = serviceFrontendReplicaState.replicaIndex;

  session.store.setState({
    sessionId: session.sessionId,
    serviceName: frontend.serviceName,
    userId,
    systemId,
    systemVersion: serviceFrontendReplicaState.systemVersion,
    frontendName: frontend.frontendName,
    serviceFrontendLockKey,
    db,
    schema: dbConfig.schema,
    models: frontend.models,
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
              userReplicaApi.acquireServiceFrontendReplica({
                serviceName: frontend.serviceName,
                frontendName: frontend.frontendName,
                serviceFrontendLockKey,
                serviceFrontendLock: frontendSpec.serviceFrontendLock,
                frontendSpec,
                mode: 'online',
                sink,
              }),
            catch: ZerospinError.catch({
              code: 'service-frontend-replica-reacquisition-failed',
              message:
                'Failed to promote cached service frontend replica online',
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
        serviceName: null,
        userId: null,
        systemId: null,
        systemVersion: null,
        frontendName: null,
        serviceFrontendLockKey: null,
        db: null,
        schema: null,
        models: null,
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
});
