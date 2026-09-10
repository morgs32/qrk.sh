import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  makeTelemetryLayer,
  makeTelemetryTracer,
  TelemetryCollector,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/schema';
import { Effect, type ManagedRuntime } from 'effect';
import { createStore } from 'zustand/vanilla';

import { encodeCommand } from '../contracts/encodeCommand.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import { makeSessionCommand } from '../contracts/makeSessionCommand.ts';
import type {
  IChainedCommand,
  IEncodedCommand,
  InferCommand,
  ISessionCommand,
} from '../contracts/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import type { initializeGuards } from '../guards/initializeGuards.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { dutils } from '../utils/dutils.ts';
import { encodeRpc } from '../utils/encodeRpc.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { Db, executeCommandTx } from './executeCommandTx.ts';
import type {
  IFrontendDelta,
  IInitializedSessionState,
  ISession,
  ISessionId,
  ISessionState,
} from './types.ts';

export function makeAggregateSession<
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
  guards: Effect.Success<
    ReturnType<typeof initializeGuards<never, unknown, unknown>>
  >;
  runtime: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
}): ISession<FRONTEND> {
  const {
    executeAggregateFrontendCommand,
    frontend,
    runtime,
    guards,
    sessionId: initialSessionId,
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
        sessionId: initialSessionId,
        aggregateId: null,
        aggregateName: null,
        userId: null,
        systemId: null,
        frontendName: null,
        aggregateFrontendLockKey: null,
        db: null,
        schema: null,
        models: null,
        isInitialized: false,
        aggregateIndex: null,
        userIndex: null,
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

  const executeCommand = Effect.fn('executeCommand')(function* <
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(commandProps: {
    contractName: CONTRACT_NAME;
    payload: unknown;
  }): Effect.fn.Return<
    Readonly<{
      command: IChainedCommand<
        InferCommand<
          FRONTEND['contracts'][CONTRACT_NAME]['contract'],
          FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']
        >,
        IFrontendDelta
      > &
        Readonly<{ sessionIndex: number }>;
      encodedCommand: IEncodedCommand<
        IChainedCommand<
          InferCommand<
            FRONTEND['contracts'][CONTRACT_NAME]['contract'],
            FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']
          >,
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
    const sessionId = state.sessionId;

    const binding = yield* getByKeyOrThrow<
      FRONTEND['contracts'],
      CONTRACT_NAME
    >({
      record: frontend.contracts,
      key: commandProps.contractName,
      recordKind: 'contracts',
    });
    const contract: FRONTEND['contracts'][CONTRACT_NAME]['contract'] =
      binding.contract;
    const version = contract.version;
    const validatedPayload = yield* contract.validatePayload({
      version,
      payload: commandProps.payload,
    });
    yield* guards.run(commandProps.contractName, {
      userId: state.userId,
      db: state.db,
      payload: validatedPayload,
    });
    const command = yield* makeSessionCommand({
      aggregateId: state.aggregateId,
      aggregateName: frontend.aggregateName,
      contract,
      frontendName: frontend.name,
      sessionId,
      systemName: frontend.systemName,
      userId: state.userId,
      validatedPayload,
      version,
    });
    const chainedAt = yield* dutils.date();
    const encodedCommand = yield* encodeCommand({ contract, command });

    const madeMutations = yield* makeMutations({
      contract,
      models: frontend.models,
      command,
    }).pipe(
      Effect.match({
        onFailure: failure => ({ failure }),
        onSuccess: success => ({ success }),
      }),
    );

    return yield* executeCommandTx({
      sessionId,
      madeMutations,
      encodedCommand,
      chainedAt,
      state,
      command,
    }).pipe(Effect.provideService(Db, state.db));
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
        executeCommand(commandProps).pipe(
          Effect.map(execution => {
            if (execution.encodedCommand !== null) {
              committedCommand = execution.encodedCommand;
            }
            return execution.command;
          }),
          Effect.provideService(TelemetryCollector, telemetryCollector),
          Effect.withTracer(makeTelemetryTracer(telemetryCollector)),
          Effect.provideContext(guards.context),
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
    get sessionId() {
      return store.getState().sessionId;
    },
    store,
  };

  return session;
}
