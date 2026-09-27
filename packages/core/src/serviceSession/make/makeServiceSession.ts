import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import type { ISessionId } from '../../aggregateSession/types.ts';
import type { IAnyModels } from '../../models/types.ts';
import type {
  IInitializedServiceSessionState,
  IServiceSession,
  IServiceSessionDefinition,
  IServiceSessionState,
} from '../types.ts';

/**
 * Synchronous service session construction. Creates the stable store only —
 * no ManagedRuntime, SQLite, or backup. Bind a session ID before publishing
 * readiness.
 */
export function makeServiceSession<
  DEFINITION extends IServiceSessionDefinition,
  MODELS extends IAnyModels = DEFINITION['models'],
>(props: {
  definition: DEFINITION;
  models: MODELS;
}): IServiceSession<DEFINITION, MODELS> {
  const { definition, models } = props;

  const store = createStore<
    IServiceSessionState<
      MODELS,
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
      sessionId: null,
      identity: null,
      serviceName: null,
      sessionName: null,
      serviceSessionLockKey: null,
      db: null,
      schema: null,
      models: null,
      isInitialized: false,
      serviceIndex: null,
      serviceHash: null,
      serviceVersion: null,
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
      state: IInitializedServiceSessionState<
        MODELS,
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

  return {
    definition,
    models,
    setSessionId(sessionId: ISessionId) {
      store.setState({ sessionId });
    },
    get sessionId() {
      return store.getState().sessionId;
    },
    onInitialized,
    store,
  };
}
