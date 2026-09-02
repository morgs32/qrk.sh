import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { StoreApi } from 'zustand';

import type {
  IChainedCommand,
  IServiceCommand,
} from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IDrizzleRelationsFromModels,
  IResourceDrizzleSchemasFromModels,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { IEncodedResourceShape, IModels } from '../models/types.ts';
import type { IFrontendDelta, ISessionId } from '../session/types.ts';
import type { ISystemId } from '../system/types.ts';

import { type serviceSessionRepoSchema } from './serviceSessionRepoTables.ts';

export type IServiceSessionRepoSchema = typeof serviceSessionRepoSchema;

export type IServiceSessionSchema<MODELS extends IModels = IModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & IServiceSessionRepoSchema;

export type IServiceSessionDrizzleDb<
  MODELS extends IModels = IModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;

export type IServiceSessionWaSqliteDb<
  MODELS extends IModels = IModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IWaSqliteDrizzleDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;

export type IServiceFrontendFinalizedCommand = IChainedCommand<
  IServiceCommand,
  IFrontendDelta
> &
  Readonly<{
    serviceIndex: number;
    serviceFrontendIndex: number;
  }>;

export type IServiceFrontendState = Readonly<{
  userId: string;
  systemId: ISystemId;
  systemVersion: string;
  serviceName: string;
  frontendName: string;
  serviceIndex: number;
  serviceFrontendIndex: number;
  resources: readonly IEncodedResourceShape[];
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
    db: IServiceSessionWaSqliteDb<MODELS, IDrizzleRelationsFromModels<MODELS>>;
    schema: IServiceSessionSchema<MODELS>;
    models: MODELS;
    isInitialized: true;
    serviceIndex: number;
    serviceFrontendIndex: number;
    sessionStatus:
      | 'bootstrapping'
      | 'current'
      | 'superseded'
      | 'failed'
      | 'released';
    backupState: Readonly<{
      status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
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
      serviceIndex: null;
      serviceFrontendIndex: null;
      sessionStatus:
        | 'bootstrapping'
        | 'current'
        | 'superseded'
        | 'failed'
        | 'released';
      backupState: Readonly<{
        status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
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
