import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/schema';
import { type Effect, type ManagedRuntime } from 'effect';
import { createStore } from 'zustand/vanilla';

import type {
  IEncodedCommand,
  ISessionCommand,
} from '../../contracts/types.ts';
import { makeId } from '../../models/make/makeId.ts';
import type { MonotonicFactory } from '../../services/MonotonicFactory.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  IInitializedSessionState,
  ISessionId,
  ISessionState,
} from '../types.ts';

type IExecutionResources = {
  sessionId: ISessionId;
  settleLocally?: boolean;
  runtime: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
  executeAggregateSessionCommand?: (props: {
    command: IEncodedCommand<
      ISessionCommand & Readonly<{ sessionIndex: number; pushIndex: null }>
    >;
  }) => Effect.Effect<
    Readonly<{ commandId: string }>,
    IAnyError | IZerospinErrorJson
  >;
};

const executionResourcesBySession = new WeakMap<
  IAggregateSession<IAggregateSessionDefinition>,
  IExecutionResources
>();

export function getAggregateSessionExecutionResources(
  session: IAggregateSession<IAggregateSessionDefinition>,
): IExecutionResources | undefined {
  return executionResourcesBySession.get(session);
}

/**
 * Synchronous aggregate session construction. Creates the stable store only —
 * no ManagedRuntime, layers, SQLite, or backup. Bind execution resources before
 * publishing readiness; stageCommand fails while unbound.
 */
export function makeAggregateSession<
  DEFINITION extends IAggregateSessionDefinition,
>(props: { definition: DEFINITION }): IAggregateSession<DEFINITION> {
  const { definition } = props;
  const store = createStore<
    ISessionState<
      DEFINITION['models'],
      DEFINITION['identity']['identitySchema']['Type']
    >
  >((set, get) => {
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
      actorName: null,
      actorVersion: null,

      sessionId: null,
      aggregateId: null,
      aggregateName: null,
      identity: null,
      sessionName: null,
      aggregateSessionLockKey: null,
      db: null,
      schema: null,
      models: null,
      isInitialized: false,
      aggregateIndex: null,
      executedIndex: null,
      executedHash: null,
      pushIndex: null,
      sessionStatus: 'bootstrapping',
      backupState: {
        status: 'pending',
        failure: null,
      },
      telemetry: emptyTelemetryBatch(),
      telemetryCollector,
    };
  });

  const onInitialized = (
    handler: (props: {
      state: IInitializedSessionState<
        DEFINITION['models'],
        DEFINITION['identity']['identitySchema']['Type']
      >;
    }) => void,
  ): (() => void) => {
    const state = store.getState();
    if (state.isInitialized && state.db !== null && state.schema !== null) {
      handler({ state });
      return () => {};
    }
    const unsubscribe = store.subscribe(next => {
      if (next.isInitialized && next.db !== null && next.schema !== null) {
        unsubscribe();
        queueMicrotask(() => {
          handler({ state: next });
        });
      }
    });
    return unsubscribe;
  };

  const session: IAggregateSession<DEFINITION> = {
    makeId(model) {
      const resources = executionResourcesBySession.get(
        session as IAggregateSession<IAggregateSessionDefinition>,
      );
      if (resources === undefined) {
        throw makeZerospinError({
          code: 'aggregate-session-not-ready',
          message:
            'Model ID generation requires bound session execution resources',
        });
      }
      return resources.runtime.runSync(makeId(model));
    },
    setExecutionResources(resources) {
      executionResourcesBySession.set(
        session as IAggregateSession<IAggregateSessionDefinition>,
        resources,
      );
      store.setState({ sessionId: resources.sessionId });
    },
    clearExecutionResources() {
      executionResourcesBySession.delete(
        session as IAggregateSession<IAggregateSessionDefinition>,
      );
    },
    definition,
    onInitialized,
    get sessionId() {
      return store.getState().sessionId;
    },
    store,
  };

  return session;
}
