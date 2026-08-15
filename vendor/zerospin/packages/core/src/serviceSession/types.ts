import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { StoreApi } from 'zustand';

import type {
  IResourceDbConfig,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';
import type {
  IEncodedResourceShape,
  IModels,
  IServiceCursorId,
} from '../models/types.ts';
import type { IFrontendDelta, ISessionId } from '../session/types.ts';
import type { ISystemId } from '../system/types.ts';

export type IServiceFrontendBlock = Readonly<{
  serviceName: string;
  userId: string;
  frontendName: string;
  frontendIndex: number;
  lastServiceCursor: IServiceCursorId;
  delta: IFrontendDelta;
}>;

export type IServiceFrontendState = Readonly<{
  userId: string;
  systemId: ISystemId;
  systemVersion: string;
  serviceName: string;
  frontendName: string;
  frontendIndex: number;
  resources: readonly IEncodedResourceShape[];
}>;

export type IServiceFrontendReplicaState = IServiceFrontendState &
  Readonly<{
    serviceFrontendLockKey: string;
    replicaIndex: number;
  }>;

export type IServiceFrontendReplicaBlock = Readonly<{
  systemId: ISystemId;
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLockKey: string;
  replicaIndex: number;
  frontendIndex: number;
  frontendBlock: IServiceFrontendBlock;
}>;

export type IInitializedServiceSessionState<MODELS extends IModels = IModels> =
  Readonly<{
    sessionId: ISessionId;
    userId: string;
    systemId: ISystemId;
    systemVersion: string;
    serviceName: string;
    frontendName: string;
    serviceFrontendLockKey: string;
    db: IWaSqliteDrizzleDb<IResourceDbConfig<MODELS, Record<never, never>>>;
    schema: IResourceDbConfig<MODELS, Record<never, never>>['schema'];
    models: MODELS;
    isInitialized: true;
    frontendIndex: number;
    replicaIndex: number | null;
    workerState: Readonly<{
      mode: 'shared-worker';
      status:
        | 'authenticating'
        | 'hydrating'
        | 'offline'
        | 'connecting'
        | 'replaying'
        | 'online'
        | 'repairing'
        | 'failed'
        | 'released';
      bootstrapSource: 'network' | 'replica' | null;
      frontendIndex: number;
      replicaIndex: number | null;
      databaseName: string | null;
      failure: IAnyErrorJson | null;
    }>;
    telemetry: ITelemetryBatch;
    telemetryCollector: ITelemetryCollector;
  }>;

export type IServiceSessionState<MODELS extends IModels = IModels> =
  | IInitializedServiceSessionState<MODELS>
  | Readonly<{
      sessionId: ISessionId;
      userId: null;
      systemId: null;
      systemVersion: null;
      serviceName: null;
      frontendName: null;
      serviceFrontendLockKey: null;
      db: null;
      schema: null;
      models: null;
      isInitialized: false;
      frontendIndex: null;
      replicaIndex: null;
      workerState: Readonly<{
        mode: 'shared-worker';
        status:
          | 'authenticating'
          | 'hydrating'
          | 'offline'
          | 'connecting'
          | 'replaying'
          | 'online'
          | 'repairing'
          | 'failed'
          | 'released';
        bootstrapSource: 'network' | 'replica' | null;
        frontendIndex: null;
        replicaIndex: null;
        databaseName: null;
        failure: IAnyErrorJson | null;
      }>;
      telemetry: ITelemetryBatch;
      telemetryCollector: ITelemetryCollector;
    }>;

export type IServiceSession<
  FRONTEND extends IServiceFrontendController = IServiceFrontendController,
> = Readonly<{
  frontend: FRONTEND;
  sessionId: ISessionId;
  onInitialized(
    handler: (props: {
      state: IInitializedServiceSessionState<FRONTEND['models']>;
    }) => void,
  ): () => void;
  store: StoreApi<IServiceSessionState<FRONTEND['models']>>;
}>;
