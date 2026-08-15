import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { ISessionId } from '@zerospin/core/session/types';
import { emptyTelemetryBatch } from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
  IDevtoolsSharedWorkerRootDiagnostics,
  IZerospinDevtoolsStoreState,
} from './types.js';

export const zerospinDevtoolsStore = createStore<IZerospinDevtoolsStoreState>()(
  set => ({
    aggregateSessionsById: new Map(),
    serviceSessionsById: new Map(),
    profiles: [],
    sharedWorkerRootsById: new Map(),
    addAggregateSession: (entry: IDevtoolsAggregateSessionEntry) =>
      set(state => {
        if (state.aggregateSessionsById.has(entry.session.sessionId)) {
          return state;
        }
        const nextAggregateSessionsById = new Map(state.aggregateSessionsById);
        nextAggregateSessionsById.set(entry.session.sessionId, entry);
        return { aggregateSessionsById: nextAggregateSessionsById };
      }),
    removeAggregateSession: (sessionId: ISessionId) =>
      set(state => {
        if (!state.aggregateSessionsById.has(sessionId)) {
          return state;
        }
        const nextAggregateSessionsById = new Map(state.aggregateSessionsById);
        nextAggregateSessionsById.delete(sessionId);
        return { aggregateSessionsById: nextAggregateSessionsById };
      }),
    addServiceSession: <FRONTEND extends IServiceFrontendController>(entry: {
      readonly session: IServiceSession<FRONTEND>;
    }) =>
      set(state => {
        const { session } = entry;
        if (state.serviceSessionsById.has(session.sessionId)) {
          return state;
        }

        const devtoolsEntry: IDevtoolsServiceSessionEntry = {
          sessionId: session.sessionId,
          serviceName: session.frontend.serviceName,
          frontendName: session.frontend.frontendName,
          modelNames: session.frontend.modelNames,
          subscribe: listener =>
            session.store.subscribe(() => {
              listener();
            }),
          getUserId: () => session.store.getState().userId,
          getIsInitialized: () => session.store.getState().isInitialized,
          getWorkerState: () => session.store.getState().workerState,
          getTelemetry: () => session.store.getState().telemetry,
          getFrontendIndex: () => session.store.getState().frontendIndex,
          getModelAttributes: modelName =>
            session.frontend.models[modelName]?.attributes,
          readModelRows: modelName => {
            const sessionState = session.store.getState();
            if (!sessionState.isInitialized || sessionState.db === null) {
              throw new Error('Service session is not initialized');
            }
            const modelQuery = sessionState.db.query[modelName];
            if (modelQuery === undefined) {
              throw new Error(`Unknown model key: ${modelName}`);
            }
            return modelQuery.findMany().sync();
          },
          clearTelemetry: () => {
            session.store.setState({ telemetry: emptyTelemetryBatch() });
          },
        };

        const nextServiceSessionsById = new Map(state.serviceSessionsById);
        nextServiceSessionsById.set(session.sessionId, devtoolsEntry);
        return { serviceSessionsById: nextServiceSessionsById };
      }),
    removeServiceSession: (sessionId: ISessionId) =>
      set(state => {
        if (!state.serviceSessionsById.has(sessionId)) {
          return state;
        }
        const nextServiceSessionsById = new Map(state.serviceSessionsById);
        nextServiceSessionsById.delete(sessionId);
        return { serviceSessionsById: nextServiceSessionsById };
      }),
    addSharedWorkerRootDiagnostics: (
      diagnostics: IDevtoolsSharedWorkerRootDiagnostics,
    ) =>
      set(state => {
        if (state.sharedWorkerRootsById.get(diagnostics.id) === diagnostics) {
          return state;
        }
        const nextSharedWorkerRootsById = new Map(state.sharedWorkerRootsById);
        nextSharedWorkerRootsById.set(diagnostics.id, diagnostics);
        return { sharedWorkerRootsById: nextSharedWorkerRootsById };
      }),
    removeSharedWorkerRootDiagnostics: (id: string) =>
      set(state => {
        if (!state.sharedWorkerRootsById.has(id)) {
          return state;
        }
        const nextSharedWorkerRootsById = new Map(state.sharedWorkerRootsById);
        nextSharedWorkerRootsById.delete(id);
        return { sharedWorkerRootsById: nextSharedWorkerRootsById };
      }),
  }),
);
