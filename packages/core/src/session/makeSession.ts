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
} from '../contracts/encodeAppliedMutation.ts';
import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import type { InferCommand, IStagedCommand } from '../contracts/types.ts';
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
        generationId: null,
        systemVersion: null,
        systemWorkerName: null,
        db: null,
        schema: null,
        models: null,
        vfsName: null,
        isInitialized: false,
        isPushPaused,
        isSharedWorkerEnabled,
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
      const effect = stageCommandEffect(props).pipe(
        Effect.provide(
          makeTelemetryLayer(store.getState().telemetryCollector),
        ),
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
