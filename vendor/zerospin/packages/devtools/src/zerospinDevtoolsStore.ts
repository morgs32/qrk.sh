import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
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
        const sessionId = entry.session.sessionId;
        if (sessionId === null) {
          return state;
        }
        if (state.aggregateSessionsById.has(sessionId)) {
          return state;
        }
        const nextAggregateSessionsById = new Map(state.aggregateSessionsById);
        nextAggregateSessionsById.set(sessionId, entry);
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
    addServiceSession: <DEFINITION extends IServiceSessionDefinition>(entry: {
      readonly session: IServiceSession<DEFINITION>;
    }) =>
      set(state => {
        const { session } = entry;
        const sessionId = session.sessionId;
        if (sessionId === null) {
          return state;
        }
        if (state.serviceSessionsById.has(sessionId)) {
          return state;
        }

        const devtoolsEntry: IDevtoolsServiceSessionEntry = {
          sessionId,
          serviceName: session.definition.serviceName,
          sessionName: session.definition.sessionName,
          modelNames: session.definition.modelNames,
          subscribe: listener =>
            session.store.subscribe(() => {
              listener();
            }),
          getIdentity: () => session.store.getState().identity,
          getIsInitialized: () => session.store.getState().isInitialized,
          getSessionStatus: () => session.store.getState().sessionStatus,
          getNodeState: () => session.store.getState().nodeState,
          getBackupState: () => session.store.getState().backupState,
          getTelemetry: () => session.store.getState().telemetry,
          getServiceIndex: () => session.store.getState().serviceIndex,
          getModelAttributes: modelName =>
            Object.entries(session.definition.models).find(
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
        nextServiceSessionsById.set(sessionId, devtoolsEntry);
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
