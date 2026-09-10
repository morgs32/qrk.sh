import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { StoreApi } from 'zustand';

import type { IChainedCommand, IServiceCommand } from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IDrizzleRelationsFromModels,
  IResourceDrizzleSchemasFromModels,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';
import type { IFrontendDelta, ISessionId } from '../session/types.ts';
import type { ISystemId } from '../system/types.ts';

import { type serviceSessionRepoSchema } from './serviceSessionRepoTables.ts';

export type IServiceSessionRepoSchema = typeof serviceSessionRepoSchema;

export type IServiceSessionSchema<MODELS extends IAnyModels = IAnyModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & IServiceSessionRepoSchema;

export type IServiceSessionDrizzleDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;

export type IServiceSessionWaSqliteDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IWaSqliteDrizzleDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;

export type IServiceFrontendFinalizedCommand = IChainedCommand<
  IServiceCommand,
  IFrontendDelta
> &
  Readonly<{
    serviceIndex: number;
    serviceVersion: string;
    dispositionHash: string;
  }>;

export type IServiceFrontendState = Readonly<{
  userId: string;
  systemId: ISystemId;
  serviceName: string;
  frontendName: string;
  serviceIndex: number;
  serviceVersion: string;
  resources: readonly IEncodedResourceShape[];
}>;

export type IInitializedServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
> = Readonly<{
  sessionId: ISessionId;
  userId: string;
  systemId: ISystemId;
  serviceName: string;
  frontendName: string;
  serviceFrontendLockKey: string;
  db: IServiceSessionWaSqliteDb<MODELS, IDrizzleRelationsFromModels<MODELS>>;
  schema: IServiceSessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  serviceIndex: number;
  serviceVersion: string;
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

export type IServiceSessionState<MODELS extends IAnyModels = IAnyModels> =
  | IInitializedServiceSessionState<MODELS>
  | Readonly<{
      sessionId: ISessionId;
      userId: null;
      systemId: null;
      serviceName: null;
      frontendName: null;
      serviceFrontendLockKey: null;
      db: null;
      schema: null;
      models: null;
      isInitialized: false;
      serviceIndex: null;
      serviceVersion: null;
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
  MODELS extends IAnyModels = FRONTEND['models'],
> = Readonly<{
  frontend: FRONTEND;
  models: MODELS;
  sessionId: ISessionId;
  onInitialized(
    handler: (props: {
      state: IInitializedServiceSessionState<MODELS>;
    }) => void,
  ): () => void;
  store: StoreApi<IServiceSessionState<MODELS>>;
}>;
