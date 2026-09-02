import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTelemetryTracer,
  TelemetryCollector,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/schema';
import { eq, sql } from 'drizzle-orm';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { createStore } from 'zustand/vanilla';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import { makeSessionCommand } from '../contracts/makeSessionCommand.ts';
import type {
  IChainedCommand,
  IEncodedCommand,
  InferCommand,
  ISessionCommand,
} from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import type { InferPayloadInput } from '../models/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { dutils } from '../utils/dutils.ts';
import { encodeRpc } from '../utils/encodeRpc.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';
import { NanoIdFactory } from '../utils/NanoIdFactory.ts';
import { UlidMonotonicFactory } from '../utils/UlidMonotonicFactory.ts';

import { SessionCommandSchema } from './AggregateFrontendCommandSchema.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionMetadataDrizzleSchema } from './sessionRepoTables.ts';
import type {
  IFrontendDelta,
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
  executeAggregateFrontendCommand?: (props: {
    command: IEncodedCommand<
      IChainedCommand<ISessionCommand, IFrontendDelta> &
        Readonly<{ sessionIndex: number; pushIndex: null }>
    >;
  }) => Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
  runtime?: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
}): ISession<FRONTEND> {
  const {
    executeAggregateFrontendCommand,
    frontend,
    runtime = defaultSessionRuntime,
    sessionId,
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
        isInitialized: false,
        aggregateIndex: null,
        frontendIndex: null,
        pushIndex: null,
        sessionStatus: 'bootstrapping',
        backupState: {
          status: 'pending',
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
        queueMicrotask(() => {
          handler({ state });
        });
      }
    });
    return unsubscribe;
  };

  const executeCommandEffect = Effect.fn('executeCommand')(function* <
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(commandProps: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<FRONTEND['contracts'][CONTRACT_NAME]['payload']>;
  }): Effect.fn.Return<
    Readonly<{
      command: IChainedCommand<
        InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>,
        IFrontendDelta
      > &
        Readonly<{ sessionIndex: number }>;
      encodedCommand: IEncodedCommand<
        IChainedCommand<
          InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>,
          IFrontendDelta
        > &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      > | null;
    }>,
    IAnyError,
    CuidFactory | MonotonicFactory
  > {
    const state = store.getState();
    if (!state.isInitialized || state.db === null || state.schema === null) {
      return yield* new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store is not initialized',
      });
    }
    if (state.sessionStatus !== 'current') {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-session-not-current',
        message: `Aggregate command execution requires a current session; received ${state.sessionStatus}`,
      });
    }

    const contract = yield* getByKeyOrThrow<
      FRONTEND['contracts'],
      CONTRACT_NAME
    >({
      record: frontend.contracts,
      key: commandProps.contractName,
      recordKind: 'contracts',
    });
    const command = yield* makeSessionCommand({
      aggregateId: state.aggregateId,
      aggregateName: frontend.aggregateName,
      contract,
      frontendName: frontend.frontendName,
      payload: commandProps.payload,
      sessionId,
      systemName: frontend.systemName,
      userId: state.userId,
    });
    const chainedAt = yield* dutils.date();
    const encodedCommand = yield* encodeCommand({ contract, command });

    const madeMutations = yield* makeMutations({
      contract,
      models: frontend.models,
      owner: { kind: 'aggregate' },
      command,
    }).pipe(
      Effect.match({
        onFailure: failure => ({ failure }),
        onSuccess: success => ({ success }),
      }),
    );

    return yield* makeTx({
      db: state.db,
      program: Effect.fn('executeCommand.transaction')(function* ({ tx }) {
        const metadata = tx
          .select()
          .from(sessionMetadataDrizzleSchema)
          .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
          .get();
        const sessionIndex = metadata?.nextSessionIndex ?? 1;
        const nextSessionIndex = sessionIndex + 1;
        if (
          !Number.isSafeInteger(sessionIndex) ||
          sessionIndex < 1 ||
          !Number.isSafeInteger(nextSessionIndex)
        ) {
          return yield* new ZerospinError({
            code: 'session-index-invalid',
            message: 'The durable next session index is invalid',
            extra: { sessionIndex },
          });
        }

        if ('failure' in madeMutations) {
          const failure = yield* Schema.encodeUnknownEffect(
            ZerospinError.schema,
          )(madeMutations.failure).pipe(
            mapParseError({
              code: 'session-command-failure-encode-failed',
              prefix: 'Failed to encode locally terminal command failure',
            }),
          );
          const delta = {
            inserted: [],
            updated: [],
            deleted: [],
            mutations: [],
          } satisfies IFrontendDelta;
          const encodedOccurrence = {
            ...encodedCommand,
            sessionIndex,
            chainedAt,
            delta,
            failedAt: chainedAt,
            failure,
          };
          const commandBytes = yield* Schema.encodeEffect(
            Schema.fromJsonString(SessionCommandSchema),
          )(encodedOccurrence).pipe(
            mapParseError({
              code: 'session-command-encode-failed',
              prefix: 'Failed to encode locally terminal command',
            }),
          );

          tx.insert(sessionCommandJournalDrizzleSchema)
            .values({
              ...encodedCommand,
              sessionIndex,
              command: commandBytes,
            })
            .run();
          tx.insert(sessionMetadataDrizzleSchema)
            .values({
              sessionId,
              nextSessionIndex,
              aggregateIndex: state.aggregateIndex,
              frontendIndex: state.frontendIndex,
              pushIndex: state.pushIndex,
              systemVersion: state.systemVersion,
            })
            .onConflictDoUpdate({
              target: sessionMetadataDrizzleSchema.sessionId,
              set: { nextSessionIndex },
            })
            .run();

          return {
            command: {
              ...command,
              sessionIndex,
              chainedAt,
              delta,
              failedAt: chainedAt,
              failure,
            },
            encodedCommand: encodedOccurrence,
          };
        }

        const encodedMutations = [];
        const inserted = new Map<
          string,
          (typeof madeMutations.success.mutations)[number]['model']
        >();
        const updated = new Map<
          string,
          (typeof madeMutations.success.mutations)[number]['model']
        >();
        const deleted = new Map<
          string,
          Readonly<{ id: string; modelName: string }>
        >();

        for (const [
          mutationIndex,
          mutation,
        ] of madeMutations.success.mutations.entries()) {
          const appliedMutation = yield* applyAggregateFrontendMutationTx({
            tx,
            mutation,
            commandId: command.id,
            mutationIndex,
            appliedAt: chainedAt,
          });
          const encodedMutation = yield* encodeAppliedMutation({
            mutation: appliedMutation,
          });
          encodedMutations.push(encodedMutation);
          const key = `${mutation.model.modelName}\u0000${mutation.resourceId}`;
          if (mutation.operationName === 'delete') {
            if (inserted.delete(key)) {
              updated.delete(key);
              deleted.delete(key);
            } else {
              updated.delete(key);
              deleted.set(key, {
                id: mutation.resourceId,
                modelName: mutation.model.modelName,
              });
            }
          } else if (
            mutation.operationName === 'create' ||
            (mutation.operationName === 'replicateResource' &&
              appliedMutation.inverseOperation === null)
          ) {
            inserted.set(key, mutation.model);
            updated.delete(key);
            deleted.delete(key);
          } else if (!inserted.has(key)) {
            updated.set(key, mutation.model);
            deleted.delete(key);
          }
        }

        const insertedResources = [];
        for (const [key, model] of inserted) {
          const id = key.slice(key.indexOf('\u0000') + 1);
          const row = tx
            .select()
            .from(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, id))
            .get();
          if (row === undefined) continue;
          insertedResources.push(
            yield* Schema.decodeUnknownEffect(
              Schema.toType(EncodedResourceSchema),
            )(row).pipe(
              mapParseError({
                code: 'session-resource-encode-failed',
                prefix: `Failed to encode session resource ${model.modelName}.${id}`,
              }),
            ),
          );
        }
        const updatedResources = [];
        for (const [key, model] of updated) {
          const id = key.slice(key.indexOf('\u0000') + 1);
          const row = tx
            .select()
            .from(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, id))
            .get();
          if (row === undefined) continue;
          updatedResources.push(
            yield* Schema.decodeUnknownEffect(
              Schema.toType(EncodedResourceSchema),
            )(row).pipe(
              mapParseError({
                code: 'session-resource-encode-failed',
                prefix: `Failed to encode session resource ${model.modelName}.${id}`,
              }),
            ),
          );
        }

        const delta = {
          inserted: insertedResources,
          updated: updatedResources,
          deleted: [...deleted.values()],
          mutations: encodedMutations,
        } satisfies IFrontendDelta;
        const encodedOccurrence = {
          ...encodedCommand,
          sessionIndex,
          chainedAt,
          delta,
          failedAt: null,
          failure: null,
        };
        const commandBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(SessionCommandSchema),
        )(encodedOccurrence).pipe(
          mapParseError({
            code: 'session-command-encode-failed',
            prefix: 'Failed to encode locally terminal command',
          }),
        );

        tx.insert(sessionCommandJournalDrizzleSchema)
          .values({
            ...encodedCommand,
            sessionIndex,
            command: commandBytes,
          })
          .run();
        const encodedMutationJson = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
        )(encodedMutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-encode-failed',
            prefix: 'Failed to encode optimistic session mutations',
          }),
        );
        tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
          .values({ commandId: command.id, mutations: encodedMutationJson })
          .onConflictDoUpdate({
            target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
            set: { mutations: sql`excluded.mutations` },
          })
          .run();
        tx.insert(sessionMetadataDrizzleSchema)
          .values({
            sessionId,
            nextSessionIndex,
            aggregateIndex: state.aggregateIndex,
            frontendIndex: state.frontendIndex,
            pushIndex: state.pushIndex,
            systemVersion: state.systemVersion,
          })
          .onConflictDoUpdate({
            target: sessionMetadataDrizzleSchema.sessionId,
            set: { nextSessionIndex },
          })
          .run();

        return {
          command: {
            ...command,
            sessionIndex,
            chainedAt,
            delta,
            failedAt: null,
            failure: null,
          },
          encodedCommand: encodedOccurrence,
        };
      }),
    });
  });

  const session: ISession<FRONTEND> = {
    executeCommand(commandProps) {
      let committedCommand:
        | IEncodedCommand<
            IChainedCommand<ISessionCommand, IFrontendDelta> &
              Readonly<{ sessionIndex: number; pushIndex: null }>
          >
        | undefined;
      const telemetryCollector = store.getState().telemetryCollector;
      const result = runtime.runSync(
        executeCommandEffect(commandProps).pipe(
          Effect.map(execution => {
            if (execution.encodedCommand !== null) {
              committedCommand = execution.encodedCommand;
            }
            return execution.command;
          }),
          Effect.provideService(TelemetryCollector, telemetryCollector),
          Effect.withTracer(makeTelemetryTracer(telemetryCollector)),
          encodeRpc,
        ),
      );

      if (
        executeAggregateFrontendCommand !== undefined &&
        committedCommand !== undefined
      ) {
        const command = committedCommand;
        runtime.runFork(
          executeAggregateFrontendCommand({ command }).pipe(
            Effect.flatMap(receipt =>
              receipt.commandId === command.id
                ? Effect.void
                : Effect.fail(
                    new ZerospinError({
                      code: 'aggregate-frontend-command-receipt-invalid',
                      message:
                        'Frontend push receipt does not match the committed command',
                    }),
                  ),
            ),
            Effect.catch(() => Effect.void),
            Effect.provide(makeTelemetryLayer(telemetryCollector)),
          ),
        );
      }
      return result;
    },
    frontend,
    onInitialized,
    sessionId,
    store,
  };

  return session;
}
