import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type { INodeState } from '../aggregateSession/NodeState.ts';
import type { IActorDelta, ISessionId } from '../aggregateSession/types.ts';
import type { ICommand } from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IDrizzleRelationsFromModels,
  IResourceDbConfig,
  IResourceDrizzleSchemasFromModels,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';

import {
  type serviceSessionRepoSchema,
  type serviceSessionRepoTables,
} from './serviceSessionRepoTables.ts';

export type IServiceSessionDefinition<
  SYSTEM_NAME extends string = string,
  SERVICE_NAME extends string = string,
  DEFINITION_NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  SERVICE_VERSION extends string = string,
  CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
> = Readonly<{
  kind: 'service';
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  actorName: string;
  actorVersion: string;
  claimsSchema: CLAIMS;
  sessionName: DEFINITION_NAME;
  contracts: Readonly<Record<never, never>>;
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;

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

export type IServiceActorCommand = Readonly<{
  id: ICommand['id'];
  serviceIndex: number;
  actorDelta: IActorDelta;
  serviceHash: string;
}>;

export type IServiceSessionSnapshot = Readonly<{
  actorName: string;
  actorVersion: string;
  claims: Readonly<Record<string, unknown>>;
  serviceName: string;
  sessionName: string;
  serviceIndex: number;
  serviceHash: string;
  serviceVersion: string;
  resources: readonly IEncodedResourceShape[];
}>;

export type IInitializedServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> = Readonly<{
  sessionId: ISessionId;
  claims: CLAIMS;
  serviceName: string;
  sessionName: string;
  serviceSessionLockKey: string;
  db: IServiceSessionWaSqliteDb<
    MODELS,
    IResourceDbConfig<MODELS, typeof serviceSessionRepoTables>['relations']
  >;
  schema: IServiceSessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  serviceIndex: number;
  serviceHash: string;
  serviceVersion: string;
  sessionStatus: 'bootstrapping' | 'current' | 'failed' | 'released';
  nodeState?: INodeState | null;
  backupState: Readonly<{
    status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
    failure: IAnyError | IZerospinErrorJson | null;
  }> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
}>;

export type IServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> =
  | IInitializedServiceSessionState<MODELS, CLAIMS>
  | Readonly<{
      sessionId: null;
      claims: null;
      serviceName: null;
      sessionName: null;
      serviceSessionLockKey: null;
      db: null;
      schema: null;
      models: null;
      isInitialized: false;
      serviceIndex: null;
      serviceHash: null;
      serviceVersion: null;
      sessionStatus: 'bootstrapping' | 'current' | 'failed' | 'released';
      nodeState?: INodeState | null;
      backupState: Readonly<{
        status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
        failure: IAnyError | IZerospinErrorJson | null;
      }> | null;
      telemetry: ITelemetryBatch;
      telemetryCollector: ITelemetryCollector;
    }>;

export type IServiceSession<
  DEFINITION extends IServiceSessionDefinition = IServiceSessionDefinition,
  MODELS extends IAnyModels = DEFINITION['models'],
> = Readonly<{
  definition: DEFINITION;
  models: MODELS;
  sessionId: ISessionId | null;
  setSessionId(sessionId: ISessionId): void;
  onInitialized(
    handler: (props: {
      state: IInitializedServiceSessionState<
        MODELS,
        DEFINITION['claimsSchema']['Type']
      >;
    }) => void,
  ): () => void;
  store: StoreApi<
    IServiceSessionState<MODELS, DEFINITION['claimsSchema']['Type']>
  >;
}>;
