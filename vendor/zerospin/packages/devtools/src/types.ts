import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type {
  IServiceFrontendLineageTransitionRequired,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
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

export interface IDevtoolsAccountSessionEntry {
  readonly session: ISession;
  readonly pushStagedCommands: () => Promise<
    Readonly<{
      pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
      failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
    }>
  >;
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
    | 'update-required'
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
  readonly actorName: string;
  readonly frontendName: string;
  readonly modelNames: readonly string[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly getActorId: () => string | null;
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

export interface IDevtoolsAccountFrontendReplicaDiagnostic {
  readonly accountId: string;
  readonly accountName: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly frontendName: string;
  readonly frontendVersion: string;
  readonly databaseName: string;
  readonly status: 'commissioning' | 'ready' | 'failed';
  readonly role: 'active' | 'commissioned';
  readonly frontendIndex: number;
  readonly replicaIndex: number;
  readonly activeProviderCount: number;
  readonly socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
  readonly reconnectAttempt: number;
  readonly journalHealth: 'healthy' | 'unverified' | 'corrupt';
  readonly hasPendingTransition: boolean;
  readonly lastFailure: IAnyErrorJson | null;
}

export interface IDevtoolsServiceFrontendReplicaDiagnostic {
  readonly serviceName: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly frontendName: string;
  readonly frontendVersion: string;
  readonly databaseName: string;
  readonly status: 'commissioning' | 'ready' | 'failed';
  readonly role: 'active' | 'commissioned';
  readonly frontendIndex: number;
  readonly replicaIndex: number;
  readonly activeProviderCount: number;
  readonly socketState: 'disconnected' | 'connecting' | 'replaying' | 'online';
  readonly reconnectAttempt: number;
  readonly pendingTransition: IServiceFrontendLineageTransitionRequired | null;
  readonly lastFailure: IAnyErrorJson | null;
}

/**
 * Safe Config-owned diagnostic facade. It deliberately omits every mutation,
 * command, credential, ticket, database-handle, and raw-journal capability
 * exposed by the owning SharedWorker PartitionApi.
 */
export interface IDevtoolsSharedWorkerRootDiagnostics {
  readonly id: string;
  readonly systemId: string;
  readonly generationId: string;
  readonly partitionKey: string;
  readonly listAccountFrontendReplicas: () => Promise<
    Schema.EitherEncoded<
      readonly IDevtoolsAccountFrontendReplicaDiagnostic[],
      IAnyErrorJson
    >
  >;
  readonly listServiceFrontendReplicas: () => Promise<
    Schema.EitherEncoded<
      readonly IDevtoolsServiceFrontendReplicaDiagnostic[],
      IAnyErrorJson
    >
  >;
}

export type IZerospinDevtoolsStoreState = {
  readonly accountSessionsById: ReadonlyMap<
    ISessionId,
    IDevtoolsAccountSessionEntry
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
  addAccountSession: (entry: IDevtoolsAccountSessionEntry) => void;
  removeAccountSession: (sessionId: ISessionId) => void;
  addServiceSession: <FRONTEND extends IServiceFrontendController>(entry: {
    readonly session: IServiceSession<FRONTEND>;
  }) => void;
  removeServiceSession: (sessionId: ISessionId) => void;
  addSharedWorkerRootDiagnostics: (
    diagnostics: IDevtoolsSharedWorkerRootDiagnostics,
  ) => void;
  removeSharedWorkerRootDiagnostics: (id: string) => void;
};
