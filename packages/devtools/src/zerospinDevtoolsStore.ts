import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { ISessionId } from '@zerospin/core/session/types';
import { emptyTelemetryBatch } from '@zerospin/logger';
import { createStore } from 'zustand/vanilla';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
  IZerospinDevtoolsStoreState,
} from './types.js';

export const zerospinDevtoolsStore = createStore<IZerospinDevtoolsStoreState>()(
  set => ({
    aggregateSessionsById: new Map(),
    serviceSessionsById: new Map(),
    profiles: [],
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
          getSessionStatus: () => session.store.getState().sessionStatus,
          getBackupState: () => session.store.getState().backupState,
          getTelemetry: () => session.store.getState().telemetry,
          getServiceIndex: () => session.store.getState().serviceIndex,
          getServiceFrontendIndex: () =>
            session.store.getState().serviceFrontendIndex,
          getModelAttributes: modelName =>
            Object.entries(session.frontend.models).find(
              ([name]) => name === modelName,
            )?.[1].attributes,
          readModelRows: modelName => {
            const sessionState = session.store.getState();
            if (!sessionState.isInitialized || sessionState.db === null) {
              throw new Error('Service session is not initialized');
            }
            const modelQuery = Object.entries(sessionState.db.query).find(
              ([name]) => name === modelName,
            )?.[1];
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
  }),
);
