import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { ISessionId } from '../session/types.ts';

import type {
  IInitializedServiceSessionState,
  IServiceSession,
  IServiceSessionState,
} from './types.ts';

export function makeServiceSession<
  FRONTEND extends IServiceFrontendController,
>(props: {
  frontend: FRONTEND;
  sessionId: ISessionId;
}): IServiceSession<FRONTEND> {
  const { frontend, sessionId } = props;

  const store = createStore<IServiceSessionState<FRONTEND['models']>>(
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
        userId: null,
        systemId: null,
        systemVersion: null,
        serviceName: null,
        frontendName: null,
        serviceFrontendLockKey: null,
        db: null,
        schema: null,
        models: null,
        isInitialized: false,
        serviceIndex: null,
        serviceFrontendIndex: null,
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
      state: IInitializedServiceSessionState<FRONTEND['models']>;
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

  return {
    frontend,
    sessionId,
    onInitialized,
    store,
  };
}
