import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { StoreApi } from 'zustand';

import type {
  IResourceDbConfig,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type {
  IActorId,
  IEncodedResourceShape,
  IModels,
  IServiceCursorId,
} from '../models/types.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';
import type { IFrontendDelta, ISessionId } from '../session/types.ts';
import type { ISystemId } from '../system/types.ts';

export type IServiceFrontendBlock = Readonly<{
  serviceName: string;
  actorName: string;
  actorId: IActorId;
  frontendName: string;
  frontendIndex: number;
  lastServiceCursor: IServiceCursorId;
  delta: IFrontendDelta;
}>;

export type IServiceFrontendState = Readonly<{
  actorId: IActorId;
  systemId: ISystemId;
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  serviceName: string;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
  resources: readonly IEncodedResourceShape[];
}>;

export type IServiceFrontendReplicaState = IServiceFrontendState &
  Readonly<{
    frontendVersion: string;
    replicaIndex: number;
  }>;

export type IServiceFrontendGenerationBoundaryBlock = Readonly<{
  kind: 'generation-boundary';
  systemId: ISystemId;
  prevGenerationId: string;
  generationId: string;
  serviceName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
}>;

export type IServiceFrontendLineageBlock =
  | IServiceFrontendGenerationBoundaryBlock
  | Readonly<{
      kind: 'service-frontend';
      systemId: ISystemId;
      generationId: string;
      serviceName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendBlock: IServiceFrontendBlock;
    }>;

export type IServiceFrontendReplicaBlock = Readonly<{
  systemId: ISystemId;
  generationId: string;
  serviceName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendVersion: string;
  replicaIndex: number;
  frontendIndex: number;
  lineageBlock: IServiceFrontendLineageBlock;
}>;

export type IServiceFrontendLineageTransitionRequired = Readonly<{
  kind: 'lineage-transition-required';
  systemId: ISystemId;
  generationId: string;
  serviceName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendVersion: string;
  appliedBoundaryIndex: number;
  remainingBoundaries: readonly IServiceFrontendGenerationBoundaryBlock[];
}>;

export type IInitializedServiceSessionState<MODELS extends IModels = IModels> =
  Readonly<{
    sessionId: ISessionId;
    actorId: IActorId;
    systemId: ISystemId;
    generationId: string;
    systemVersion: string;
    systemWorkerName: string;
    serviceName: string;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
    db: IWaSqliteDrizzleDb<IResourceDbConfig<MODELS, Record<never, never>>>;
    schema: IResourceDbConfig<MODELS, Record<never, never>>['schema'];
    models: MODELS;
    isInitialized: true;
    frontendIndex: number;
    replicaIndex: number | null;
    workerState: Readonly<{
      mode: 'shared-worker' | 'direct';
      status:
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
      actorId: null;
      systemId: null;
      generationId: null;
      systemVersion: null;
      systemWorkerName: null;
      serviceName: null;
      actorName: null;
      frontendName: null;
      frontendVersion: null;
      db: null;
      schema: null;
      models: null;
      isInitialized: false;
      frontendIndex: null;
      replicaIndex: null;
      workerState: Readonly<{
        mode: 'shared-worker' | 'direct';
        status:
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
