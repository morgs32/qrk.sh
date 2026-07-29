import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Runtime, Schema } from 'effect';
import { createStore } from 'zustand/vanilla';

import { applyFrontendMutationTx } from '../contracts/applyFrontendMutationTx.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
  encodeFrontendMutation,
} from '../contracts/encodeAppliedMutation.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import type {
  IEncodedCommand,
  IEncodedFrontendMutation,
  InferCommand,
  IStagedCommand,
} from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';
import { dutils } from '../utils/dutils.ts';
import { encodeRpc } from '../utils/encodeRpc.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';
import { makeCursor } from '../utils/makeCursor.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';
import type { ISignatureFactory } from '../utils/types.ts';
import { UlidMonotonicFactory } from '../utils/UlidMonotonicFactory.ts';

import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type {
  IInitializedSessionState,
  ISession,
  ISessionId,
  ISessionState,
} from './types.ts';

export const defaultSessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

export function makeSession<FRONTEND extends IFrontendController>(props: {
  frontend: FRONTEND;
  generateSignature: ISignatureFactory;
  sessionId: ISessionId;
  stageFrontendCommand?: (props: {
    baseReplicaIndex: number;
    command: IEncodedCommand<IStagedCommand>;
    mutations: readonly IEncodedFrontendMutation[];
  }) => Effect.Effect<void, IAnyError>;
  isPushPaused?: boolean;
  isSharedWorkerEnabled?: boolean;
  runtime?:
    | ManagedRuntime.ManagedRuntime<CuidFactory | MonotonicFactory, IAnyError>
    | Runtime.Runtime<CuidFactory | MonotonicFactory>;
}): ISession<FRONTEND> {
  const {
    frontend,
    generateSignature,
    sessionId,
    stageFrontendCommand,
    isPushPaused = false,
    isSharedWorkerEnabled = false,
    runtime = defaultSessionRuntime,
  } = props;

  const store = createStore<ISessionState<InferFrontendModels<FRONTEND>>>(
    (set, get) => {
      const telemetryCollector: ITelemetryCollector = {
        addSpan: span => {
          set(state => ({
            ...state,
            telemetry: {
              ...state.telemetry,
              spans: [...state.telemetry.spans, span],
            },
          }));
        },
        addLog: log => {
          set(state => ({
            ...state,
            telemetry: {
              ...state.telemetry,
              logs: [...state.telemetry.logs, log],
            },
          }));
        },
        addLinks: links => {
          set(state => ({
            ...state,
            telemetry: {
              ...state.telemetry,
              links: [...state.telemetry.links, ...links],
            },
          }));
        },
        merge: batch => {
          set(state => ({
            ...state,
            telemetry: {
              spans: [...state.telemetry.spans, ...batch.spans],
              logs: [...state.telemetry.logs, ...batch.logs],
              links: [...state.telemetry.links, ...batch.links],
            },
          }));
        },
        flush: () => {
          const batch = get().telemetry;
          set({ telemetry: emptyTelemetryBatch() });
          return batch;
        },
      };

      return {
        sessionId,
        accountId: null,
        accountName: null,
        actorId: null,
        systemId: null,
        generationId: null,
        systemVersion: null,
        systemWorkerName: null,
        frontendName: null,
        frontendVersion: null,
        db: null,
        schema: null,
        models: null,
        vfsName: null,
        isInitialized: false,
        frontendIndex: null,
        replicaIndex: null,
        lastRebasedPushedCursor: null,
        isPushPaused,
        isSharedWorkerEnabled,
        workerState: {
          mode: isSharedWorkerEnabled ? 'shared-worker' : 'direct',
          status: 'authenticating',
          bootstrapSource: null,
          frontendIndex: null,
          replicaIndex: null,
          databaseName: null,
          failure: null,
        },
        lastDevtoolsPush: null,
        telemetry: emptyTelemetryBatch(),
        telemetryCollector,
      };
    },
  );

  const onInitialized = (
    handler: (props: {
      state: IInitializedSessionState<InferFrontendModels<FRONTEND>>;
    }) => void,
  ): (() => void) => {
    const state = store.getState();
    if (state.isInitialized && state.db !== null && state.schema !== null) {
      handler({ state });
      return () => {};
    }

    const unsubscribe = store.subscribe(state => {
      if (state.isInitialized && state.db !== null && state.schema !== null) {
        unsubscribe();
        // Deliver outside the store's setState so a throwing handler cannot
        // make bootstrap's initialized publication report failure.
        queueMicrotask(() => {
          handler({ state });
        });
      }
    });
    return unsubscribe;
  };

  const stageCommandEffect = Effect.fn('stageCommand')(function* <
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<FRONTEND['contracts'][CONTRACT_NAME]['payload']>;
  }): Effect.fn.Return<
    IStagedCommand<InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>>,
    IAnyError,
    CuidFactory | MonotonicFactory
  > {
    const { contractName, payload } = props;

    const state = store.getState();
    if (!state.isInitialized || state.db === null || state.schema === null) {
      return yield* new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store is not initialized',
      });
    }
    if (state.workerState.status === 'update-required') {
      return yield* new ZerospinError({
        code: 'frontend-update-required',
        message:
          'Account command staging is suspended until matching frontend code is loaded',
      });
    }
    if (state.workerState.status === 'repairing') {
      return yield* new ZerospinError({
        code: 'frontend-repairing',
        message:
          'Account command staging is suspended while authoritative frontend state is being repaired',
      });
    }
    if (state.workerState.status === 'failed') {
      if (state.workerState.failure !== null) {
        return yield* new ZerospinError(state.workerState.failure);
      }
      return yield* new ZerospinError({
        code: 'frontend-session-repair-failed',
        message:
          'Account command staging is suspended after frontend session repair failed',
      });
    }
    if (state.workerState.status === 'released') {
      return yield* new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store has been released',
      });
    }
    const { accountId, actorId, db, systemVersion } = state;

    const contract = yield* getByKeyOrThrow({
      record: frontend.contracts,
      key: contractName,
      recordKind: 'contracts',
    });
    const unstagedCommand = yield* frontend.makeUnstagedCommand({
      accountId,
      actorId,
      commandName: contractName,
      payload,
      sessionId,
      systemVersion,
    });

    const stagedCursor = yield* makeCursor({
      abbreviation: coreAbbreviations.stagedCursor,
    });
    const now = yield* dutils.date();

    const stagedCommand: IStagedCommand<
      InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>
    > = {
      ...unstagedCommand,
      stagedCursor,
      status: 'staged',
      stagedAt: now,
    };

    const { mutations } = yield* makeMutations({
      contract,
      models: frontend.models,
      owner: { kind: 'account' },
      command: stagedCommand,
    });

    // SharedWorker mode evaluates authored code against the mounted session
    // snapshot, but the worker is the only durable mutation owner. Submit the
    // complete prepared intent and wait for its fan-out callback to commit the
    // resulting replica transaction into this database.
    if (stageFrontendCommand !== undefined) {
      if (state.replicaIndex === null) {
        return yield* new ZerospinError({
          code: 'session-replica-index-not-initialized',
          message:
            'SharedWorker command staging requires an initialized replica index',
        });
      }
      const encodedCommand = yield* encodeCommand({
        contract,
        command: stagedCommand,
      });
      const encodedMutations: IEncodedFrontendMutation[] = [];
      for (const [mutationIndex, mutation] of mutations.entries()) {
        encodedMutations.push(
          yield* encodeFrontendMutation({
            commandId: stagedCommand.id,
            mutationIndex,
            mutation,
          }),
        );
      }
      yield* stageFrontendCommand({
        baseReplicaIndex: state.replicaIndex,
        command: encodedCommand,
        mutations: encodedMutations,
      });
      return stagedCommand;
    }

    const staged = yield* makeTx({
      db,
      program: Effect.fn('transaction')(function* ({ tx }) {
        const encoded = yield* encodeCommand({
          contract,
          command: stagedCommand,
        });

        tx.insert(sessionStagedCommandDrizzleSchema).values(encoded).run();

        const encodedAppliedMutations = [];
        for (const [mutationIndex, mutation] of mutations.entries()) {
          const appliedMutation = yield* applyFrontendMutationTx({
            tx,
            mutation,
            commandId: stagedCommand.id,
            mutationIndex,
            appliedAt: now,
          });
          encodedAppliedMutations.push(
            yield* encodeAppliedMutation({ mutation: appliedMutation }),
          );
        }

        const optimisticMutations = yield* Schema.encode(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(encodedAppliedMutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-encode-failed',
            prefix: 'Failed to encode optimistic session mutations',
          }),
        );

        tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
          .values({
            commandId: stagedCommand.id,
            mutations: optimisticMutations,
          })
          .onConflictDoUpdate({
            target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
            set: {
              mutations: sql`excluded.mutations`,
            },
          })
          .run();

        return stagedCommand;
      }),
    });

    return staged;
  });

  const session: ISession<FRONTEND> = {
    frontend,
    generateSignature,
    onInitialized,
    sessionId,
    stageCommand(props) {
      let attemptedReplicaIndex = store.getState().replicaIndex;
      const effect = Effect.suspend(() => {
        attemptedReplicaIndex = store.getState().replicaIndex;
        return stageCommandEffect(props);
      }).pipe(
        Effect.catchIf(
          error =>
            stageFrontendCommand !== undefined &&
            error.code === 'account-frontend-replica-base-index-stale' &&
            typeof error.extra?.expectedReplicaIndex === 'number' &&
            typeof error.extra.receivedReplicaIndex === 'number' &&
            error.extra.expectedReplicaIndex >
              error.extra.receivedReplicaIndex &&
            error.extra.receivedReplicaIndex === attemptedReplicaIndex,
          error => {
            const expectedReplicaIndex =
              typeof error.extra?.expectedReplicaIndex === 'number'
                ? error.extra.expectedReplicaIndex
                : null;
            if (expectedReplicaIndex === null) {
              return Effect.fail(error);
            }
            return Effect.async<void>(resume => {
              let isWaiting = true;
              const unsubscribe = store.subscribe(state => {
                if (
                  isWaiting &&
                  ((state.replicaIndex !== null &&
                    state.replicaIndex >= expectedReplicaIndex) ||
                    !state.isInitialized ||
                    state.workerState.status === 'repairing' ||
                    state.workerState.status === 'update-required' ||
                    state.workerState.status === 'failed' ||
                    state.workerState.status === 'released')
                ) {
                  isWaiting = false;
                  unsubscribe();
                  resume(Effect.void);
                }
              });
              const state = store.getState();
              if (
                isWaiting &&
                ((state.replicaIndex !== null &&
                  state.replicaIndex >= expectedReplicaIndex) ||
                  !state.isInitialized ||
                  state.workerState.status === 'repairing' ||
                  state.workerState.status === 'update-required' ||
                  state.workerState.status === 'failed' ||
                  state.workerState.status === 'released')
              ) {
                isWaiting = false;
                unsubscribe();
                resume(Effect.void);
              }
              return Effect.sync(() => {
                isWaiting = false;
                unsubscribe();
              });
            }).pipe(Effect.zipRight(Effect.fail(error)));
          },
        ),
        // A worker-owned push may commit and fan out between two dependent
        // public stage calls. A stale response waits for this session to
        // consume the missing replica block before retrying the whole contract
        // program against the current database. A repair/update gate wakes the
        // retry so stageCommandEffect returns that terminal state instead of
        // waiting forever. Every non-stale failure, especially a post-commit
        // local-application failure, remains final.
        Effect.retry({
          while: error =>
            stageFrontendCommand !== undefined &&
            error.code === 'account-frontend-replica-base-index-stale' &&
            typeof error.extra?.expectedReplicaIndex === 'number' &&
            typeof error.extra.receivedReplicaIndex === 'number' &&
            error.extra.expectedReplicaIndex >
              error.extra.receivedReplicaIndex &&
            error.extra.receivedReplicaIndex === attemptedReplicaIndex,
        }),
        Effect.provide(makeTelemetryLayer(store.getState().telemetryCollector)),
        encodeRpc,
      );
      if ('context' in runtime) {
        return Runtime.runPromise(runtime, effect);
      }
      return runtime.runPromise(effect);
    },
    store,
  };

  return session;
}
