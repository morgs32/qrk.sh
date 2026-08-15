import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTelemetryTracer,
  TelemetryCollector,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { eq, sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Runtime, Schema } from 'effect';
import { createStore } from 'zustand/vanilla';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import {
  encodeAggregateFrontendMutation,
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import type {
  IEncodedAggregateFrontendMutation,
  IEncodedCommand,
  InferCommand,
  IStagedSessionCommand,
} from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type {
  IAggregateFrontendController,
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
import { UlidMonotonicFactory } from '../utils/UlidMonotonicFactory.ts';

import {
  sessionFailedCommandDrizzleSchema,
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

export function makeSession<
  FRONTEND extends IAggregateFrontendController,
>(props: {
  frontend: FRONTEND;
  sessionId: ISessionId;
  stageAggregateFrontendCommand?: (props: {
    sessionIndex: number;
    command: IEncodedCommand<IStagedSessionCommand>;
    mutations: readonly IEncodedAggregateFrontendMutation[];
  }) => Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
  runtime?:
    | ManagedRuntime.ManagedRuntime<CuidFactory | MonotonicFactory, IAnyError>
    | Runtime.Runtime<CuidFactory | MonotonicFactory>;
}): ISession<FRONTEND> {
  const {
    frontend,
    sessionId,
    stageAggregateFrontendCommand,
    runtime = defaultSessionRuntime,
  } = props;
  let nextSessionIndex = 1;

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
          status: 'authenticating',
          bootstrapSource: null,
          frontendIndex: null,
          replicaIndex: null,
          databaseName: null,
          failure: null,
        },
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
    Readonly<{
      stagedCommand: IStagedSessionCommand<
        InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>
      >;
      encodedCommand: IEncodedCommand<
        IStagedSessionCommand<
          InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>
        >
      >;
      encodedMutations: readonly IEncodedAggregateFrontendMutation[];
      sessionIndex: number;
    }>,
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
    if (state.workerState.status === 'repairing') {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-repairing',
        message:
          'Aggregate command staging is suspended while authoritative frontend state is being repaired',
      });
    }
    if (state.workerState.status === 'failed') {
      if (state.workerState.failure !== null) {
        return yield* new ZerospinError(state.workerState.failure);
      }
      return yield* new ZerospinError({
        code: 'aggregate-frontend-session-repair-failed',
        message:
          'Aggregate command staging is suspended after frontend session repair failed',
      });
    }
    if (state.workerState.status === 'released') {
      return yield* new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store has been released',
      });
    }
    const { aggregateId, userId, db } = state;

    const contract = yield* getByKeyOrThrow({
      record: frontend.contracts,
      key: contractName,
      recordKind: 'contracts',
    });
    const unstagedCommand = yield* frontend.makeUnstagedCommand({
      aggregateId,
      userId,
      commandName: contractName,
      payload,
      sessionId,
    });

    const stagedCursor = yield* makeCursor({
      abbreviation: coreAbbreviations.stagedCursor,
    });
    const now = yield* dutils.date();

    const stagedCommand: IStagedSessionCommand<
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
      owner: { kind: 'aggregate' },
      command: stagedCommand,
    });

    const encodedCommand = yield* encodeCommand({
      contract,
      command: stagedCommand,
    });
    const encodedMutations: IEncodedAggregateFrontendMutation[] = [];
    for (const [mutationIndex, mutation] of mutations.entries()) {
      encodedMutations.push(
        yield* encodeAggregateFrontendMutation({
          commandId: stagedCommand.id,
          mutationIndex,
          mutation,
        }),
      );
    }

    const sessionIndex = nextSessionIndex;

    yield* makeTx({
      db,
      program: Effect.fn('transaction')(function* ({ tx }) {
        tx.insert(sessionStagedCommandDrizzleSchema)
          .values(encodedCommand)
          .run();

        const encodedAppliedMutations = [];
        for (const [mutationIndex, mutation] of mutations.entries()) {
          const appliedMutation = yield* applyAggregateFrontendMutationTx({
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
      }),
    });
    nextSessionIndex += 1;

    return { stagedCommand, encodedCommand, encodedMutations, sessionIndex };
  });

  const session: ISession<FRONTEND> = {
    frontend,
    onInitialized,
    sessionId,
    stageCommand(props) {
      let committedHandoff:
        | Readonly<{
            command: IEncodedCommand<IStagedSessionCommand>;
            mutations: readonly IEncodedAggregateFrontendMutation[];
            sessionIndex: number;
          }>
        | undefined;
      const telemetryCollector = store.getState().telemetryCollector;
      const effect = stageCommandEffect(props).pipe(
        Effect.map(result => {
          committedHandoff = {
            command: result.encodedCommand,
            mutations: result.encodedMutations,
            sessionIndex: result.sessionIndex,
          };
          return result.stagedCommand;
        }),
        Effect.provideService(TelemetryCollector, telemetryCollector),
        Effect.withTracer(makeTelemetryTracer(telemetryCollector)),
        encodeRpc,
      );
      const result =
        'context' in runtime
          ? Runtime.runSync(runtime)(effect)
          : runtime.runSync(effect);

      if (
        stageAggregateFrontendCommand !== undefined &&
        committedHandoff !== undefined
      ) {
        const handoff = committedHandoff;
        const program = stageAggregateFrontendCommand(handoff).pipe(
          Effect.flatMap(receipt =>
            receipt.commandId === handoff.command.id
              ? Effect.void
              : Effect.fail(
                  new ZerospinError({
                    code: 'shared-worker-command-receipt-invalid',
                    message:
                      'SharedWorker durable command receipt does not match the committed command',
                  }),
                ),
          ),
          Effect.catchAll(error =>
            Effect.gen(function* () {
              const state = store.getState();
              if (
                !state.isInitialized ||
                state.db === null ||
                state.workerState.status === 'released'
              ) {
                return;
              }
              const failedAt = yield* dutils.date();
              yield* makeTx({
                db: state.db,
                program: Effect.fn('stageCommand.handoffFailure')(function* ({
                  tx,
                }) {
                  const command = tx
                    .select()
                    .from(sessionStagedCommandDrizzleSchema)
                    .where(
                      eq(
                        sessionStagedCommandDrizzleSchema.id,
                        handoff.command.id,
                      ),
                    )
                    .get();
                  if (command === undefined) return;
                  tx.delete(sessionStagedCommandDrizzleSchema)
                    .where(
                      eq(
                        sessionStagedCommandDrizzleSchema.id,
                        handoff.command.id,
                      ),
                    )
                    .run();
                  tx.insert(sessionFailedCommandDrizzleSchema)
                    .values({
                      ...command,
                      pushedAt: null,
                      aggregateCursor: null,
                      aggregateIndex: null,
                      failedAt,
                      failure: ZerospinError.stringify(error),
                      status: 'failed',
                    })
                    .run();
                }),
              });
              const current = store.getState();
              if (
                current.isInitialized &&
                current.workerState.status !== 'released'
              ) {
                store.setState({
                  workerState: {
                    ...current.workerState,
                    status: 'failed',
                    failure: Schema.encodeUnknownSync(ZerospinError.schema)(
                      error,
                    ),
                  },
                });
              }
            }),
          ),
          Effect.catchAll(error =>
            Effect.sync(() => {
              const current = store.getState();
              if (
                current.isInitialized &&
                current.workerState.status !== 'released'
              ) {
                store.setState({
                  workerState: {
                    ...current.workerState,
                    status: 'failed',
                    failure: Schema.encodeUnknownSync(ZerospinError.schema)(
                      error,
                    ),
                  },
                });
              }
            }),
          ),
          Effect.provide(
            makeTelemetryLayer(store.getState().telemetryCollector),
          ),
        );
        if ('context' in runtime) {
          Runtime.runFork(runtime)(program);
        } else {
          runtime.runFork(program);
        }
      }

      return result;
    },
    store,
  };

  return session;
}
