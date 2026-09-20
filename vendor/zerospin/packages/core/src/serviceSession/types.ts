import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { StoreApi } from 'zustand';

import type { ICommand } from '../contracts/types.ts';
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

export type IServiceSelectedCommand = Readonly<{
  id: ICommand['id'];
  serviceIndex: number;
  delta: IFrontendDelta;
  serviceHash: string;
}>;

export type IServiceFrontendSnapshot = Readonly<{
  authentication: Readonly<Record<string, unknown>>;
  serviceName: string;
  frontendName: string;
  serviceIndex: number;
  serviceHash: string;
  serviceVersion: string;
  resources: readonly IEncodedResourceShape[];
}>;

export type IInitializedServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
  AUTHENTICATION = Readonly<Record<string, unknown>>,
> = Readonly<{
  sessionId: ISessionId;
  authentication: AUTHENTICATION;
  serviceName: string;
  frontendName: string;
  serviceFrontendLockKey: string;
  db: IServiceSessionWaSqliteDb<MODELS, IDrizzleRelationsFromModels<MODELS>>;
  schema: IServiceSessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  serviceIndex: number;
  serviceHash: string;
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

export type IServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
  AUTHENTICATION = Readonly<Record<string, unknown>>,
> =
  | IInitializedServiceSessionState<MODELS, AUTHENTICATION>
  | Readonly<{
      sessionId: null;
      authentication: null;
      serviceName: null;
      frontendName: null;
      serviceFrontendLockKey: null;
      db: null;
      schema: null;
      models: null;
      isInitialized: false;
      serviceIndex: null;
      serviceHash: null;
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
  sessionId: ISessionId | null;
  setSessionId(sessionId: ISessionId): void;
  onInitialized(
    handler: (props: {
      state: IInitializedServiceSessionState<
        MODELS,
        FRONTEND['authentication']['authenticationSchema']['Type']
      >;
    }) => void,
  ): () => void;
  store: StoreApi<
    IServiceSessionState<
      MODELS,
      FRONTEND['authentication']['authenticationSchema']['Type']
    >
  >;
}>;
