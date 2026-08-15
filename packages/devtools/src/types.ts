import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { ISession, ISessionId } from '@zerospin/core/session/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import type { Schema } from 'effect';

export type IModifierKey = 'Alt' | 'Control' | 'Meta' | 'Shift' | 'CtrlOrMeta';
export type IKeyboardKey = IModifierKey | (string & {});
export type IZerospinDevtoolsTheme = 'light' | 'dark';

export type ITriggerPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'middle-left'
  | 'middle-right';

export type IZerospinDevtoolsConfig = {
  defaultOpen?: boolean;
  hideUntilHover?: boolean;
  position?: ITriggerPosition;
  panelLocation?: 'top' | 'bottom';
  openHotkey?: Array<IKeyboardKey>;
  theme?: IZerospinDevtoolsTheme;
  triggerHidden?: boolean;
};

export type IDevtoolsStore = {
  settings: {
    defaultOpen: boolean;
    hideUntilHover: boolean;
    position: ITriggerPosition;
    panelLocation: 'top' | 'bottom';
    openHotkey: Array<IKeyboardKey>;
    theme: IZerospinDevtoolsTheme;
    triggerHidden: boolean;
  };
  state: {
    height: number;
    persistOpen: boolean;
  };
};

/** Profiler row stub; extend when wiring data into the store. */
export interface IProfilerProfile {
  readonly id: string;
  readonly recordedAt: number;
  readonly props: Readonly<Record<string, unknown>>;
}

export interface IDevtoolsAggregateSessionEntry {
  readonly session: ISession;
}

export interface IDevtoolsWorkerState {
  readonly mode: 'shared-worker' | 'direct';
  readonly status:
    | 'authenticating'
    | 'hydrating'
    | 'offline'
    | 'connecting'
    | 'replaying'
    | 'online'
    | 'repairing'
    | 'failed'
    | 'released';
  readonly bootstrapSource: 'network' | 'replica' | null;
  readonly frontendIndex: number | null;
  readonly replicaIndex: number | null;
  readonly databaseName: string | null;
  readonly failure: IAnyErrorJson | null;
}

/**
 * Generic-erased, read-only service session view retained by DevTools.
 * Every callback closes over the original typed service session, so the
 * heterogeneous registry never widens its invariant Zustand StoreApi.
 */
export interface IDevtoolsServiceSessionEntry {
  readonly sessionId: ISessionId;
  readonly serviceName: string;
  readonly frontendName: string;
  readonly modelNames: readonly string[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly getUserId: () => string | null;
  readonly getIsInitialized: () => boolean;
  readonly getWorkerState: () => IDevtoolsWorkerState;
  readonly getTelemetry: () => ITelemetryBatch;
  readonly getFrontendIndex: () => number | null;
  readonly getModelAttributes: (
    modelName: string,
  ) => Readonly<Record<string, unknown>> | undefined;
  readonly readModelRows: (modelName: string) => unknown;
  readonly clearTelemetry: () => void;
}

export interface IDevtoolsAggregateFrontendReplicaDiagnostic {
  readonly aggregateId: IAggregateId;
  readonly aggregateName: string;
  readonly userId: string;
  readonly frontendName: string;
  readonly aggregateFrontendLockKey: string;
  readonly systemVersion: string;
  readonly databaseName: string;
  readonly status: 'activating' | 'ready' | 'repairing' | 'failed';
  readonly frontendIndex: number;
  readonly replicaIndex: number;
  readonly activeRegistrationCount: number;
  readonly socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
  readonly reconnectAttempt: number;
  readonly pushInFlight: boolean;
  readonly lastFailure: IAnyErrorJson | null;
}

export interface IDevtoolsServiceFrontendReplicaDiagnostic {
  readonly serviceName: string;
  readonly userId: string;
  readonly frontendName: string;
  readonly serviceFrontendLockKey: string;
  readonly systemVersion: string;
  readonly databaseName: string;
  readonly status: 'activating' | 'ready' | 'failed';
  readonly frontendIndex: number;
  readonly replicaIndex: number;
  readonly activeRegistrationCount: number;
  readonly socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
  readonly reconnectAttempt: number;
  readonly lastFailure: IAnyErrorJson | null;
}

/**
 * Safe Config-owned diagnostic facade. It deliberately omits every mutation,
 * command, credential, ticket, database-handle, and raw-journal capability
 * exposed by the owning SharedWorker UserPartitionRepo.
 */
export interface IDevtoolsSharedWorkerRootDiagnostics {
  readonly id: string;
  readonly systemId: string;
  readonly userId: string;
  readonly mode: 'online' | 'existing-only';
  readonly listAggregateFrontendReplicas: () => Promise<
    Schema.EitherEncoded<
      readonly IDevtoolsAggregateFrontendReplicaDiagnostic[],
      IAnyErrorJson
    >
  >;
  readonly listServiceFrontendReplicas: () => Promise<
    Schema.EitherEncoded<
      readonly IDevtoolsServiceFrontendReplicaDiagnostic[],
      IAnyErrorJson
    >
  >;
  readonly getPushPaused: (props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
  }) => Promise<Schema.EitherEncoded<boolean, IAnyErrorJson>>;
  readonly setPushPaused: (props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
    pushPaused: boolean;
  }) => Promise<Schema.EitherEncoded<void, IAnyErrorJson>>;
  readonly pushNow: (props: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLockKey: string;
  }) => Promise<
    Schema.EitherEncoded<
      | Readonly<{ status: 'empty' }>
      | Readonly<{ status: 'pushed' }>
      | Readonly<{
          status: 'retry-exhausted';
          failure: IAnyErrorJson;
        }>,
      IAnyErrorJson
    >
  >;
}

export type IZerospinDevtoolsStoreState = {
  readonly aggregateSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsAggregateSessionEntry
  >;
  readonly serviceSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsServiceSessionEntry
  >;
  readonly profiles: ReadonlyArray<IProfilerProfile>;
  readonly sharedWorkerRootsById: ReadonlyMap<
    string,
    IDevtoolsSharedWorkerRootDiagnostics
  >;
  addAggregateSession: (entry: IDevtoolsAggregateSessionEntry) => void;
  removeAggregateSession: (sessionId: ISessionId) => void;
  addServiceSession: <FRONTEND extends IServiceFrontendController>(entry: {
    readonly session: IServiceSession<FRONTEND>;
  }) => void;
  removeServiceSession: (sessionId: ISessionId) => void;
  addSharedWorkerRootDiagnostics: (
    diagnostics: IDevtoolsSharedWorkerRootDiagnostics,
  ) => void;
  removeSharedWorkerRootDiagnostics: (id: string) => void;
};
