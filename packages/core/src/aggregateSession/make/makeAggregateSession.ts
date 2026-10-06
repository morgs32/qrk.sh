import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import { makeBoundAggregateSessionId } from '../bindAggregateSession.ts';
import { onStageFailure } from '../stageCommand/stageFailureListeners.ts';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  IInitializedSessionState,
  ISessionState,
} from '../types.ts';

/**
 * Synchronous aggregate session construction. Creates the stable store only —
 * no ManagedRuntime, layers, SQLite, or backup. Initialization binds command operations before
 * publishing readiness; stageCommand fails while unbound.
 */
export function makeAggregateSession<
  DEFINITION extends IAggregateSessionDefinition,
>(props: { definition: DEFINITION }): IAggregateSession<DEFINITION> {
  const { definition } = props;
  const store = createStore<
    ISessionState<DEFINITION['models'], DEFINITION['claimsSchema']['Type']>
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
      claims: null,
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
        DEFINITION['claimsSchema']['Type']
      >;
    }) => void,
  ): (() => void) => {
    const state = store.getState();
    if (state.isInitialized) {
      handler({ state });
      return () => {};
    }
    const unsubscribe = store.subscribe(next => {
      if (next.isInitialized) {
        unsubscribe();
        queueMicrotask(() => {
          handler({ state: next });
        });
      }
    });
    return unsubscribe;
  };

  const session: IAggregateSession<DEFINITION> = {
    onStageFailure(handler) {
      return onStageFailure(session, handler);
    },
    makeId(model) {
      return makeBoundAggregateSessionId(session, model);
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
