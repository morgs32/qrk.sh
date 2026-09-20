import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  emptyTelemetryBatch,
  type ITelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/schema';
import { type Effect, type ManagedRuntime } from 'effect';
import { createStore } from 'zustand/vanilla';

import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '../contracts/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import type { initializeGuards } from '../guards/initializeGuards.ts';
import { makeId } from '../models/makeId.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

import type {
  IFrontendDelta,
  IInitializedSessionState,
  ISession,
  ISessionId,
  ISessionState,
} from './types.ts';

type IExecutionResources = {
  sessionId: ISessionId;
  guards: Effect.Success<
    ReturnType<typeof initializeGuards<never, unknown, unknown>>
  >;
  runtime: ManagedRuntime.ManagedRuntime<
    CuidFactory | MonotonicFactory,
    IAnyError
  >;
  executeAggregateFrontendCommand?: (props: {
    command: IEncodedCommand<
      IChainedCommand<ISessionCommand, IFrontendDelta> &
        Readonly<{ sessionIndex: number; pushIndex: null }>
    >;
  }) => Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
};

const executionResourcesBySession = new WeakMap<
  ISession<IAggregateFrontendController>,
  IExecutionResources
>();

export function getAggregateSessionExecutionResources(
  session: ISession<IAggregateFrontendController>,
): IExecutionResources | undefined {
  return executionResourcesBySession.get(session);
}

/**
 * Synchronous aggregate session construction. Creates the stable store only —
 * no ManagedRuntime, layers, SQLite, or backup. Bind execution resources before
 * publishing readiness; stageCommand fails while unbound.
 */
export function makeAggregateSession<
  FRONTEND extends IAggregateFrontendController,
>(props: { frontend: FRONTEND }): ISession<FRONTEND> {
  const { frontend } = props;
  const store = createStore<
    ISessionState<
      InferFrontendModels<FRONTEND>,
      FRONTEND['authentication']['authenticationSchema']['Type']
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
      aggregateId: null,
      aggregateName: null,
      authentication: null,
      systemId: null,
      frontendName: null,
      aggregateFrontendLockKey: null,
      db: null,
      schema: null,
      models: null,
      isInitialized: false,
      aggregateIndex: null,
      selectionIndex: null,
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
        InferFrontendModels<FRONTEND>,
        FRONTEND['authentication']['authenticationSchema']['Type']
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

  const session: ISession<FRONTEND> = {
    makeId(model) {
      const resources = executionResourcesBySession.get(
        session as ISession<IAggregateFrontendController>,
      );
      if (resources === undefined) {
        throw new ZerospinError({
          code: 'aggregate-frontend-session-not-ready',
          message:
            'Model ID generation requires bound session execution resources',
        });
      }
      return resources.runtime.runSync(makeId(model));
    },
    setExecutionResources(resources) {
      executionResourcesBySession.set(
        session as ISession<IAggregateFrontendController>,
        resources,
      );
      store.setState({ sessionId: resources.sessionId });
    },
    clearExecutionResources() {
      executionResourcesBySession.delete(
        session as ISession<IAggregateFrontendController>,
      );
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
