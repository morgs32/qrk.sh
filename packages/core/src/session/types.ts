import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { InferIdFromAbbreviation } from '@zerospin/schema';
import type { AnyRelations } from 'drizzle-orm';
import type { Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type { AggregateExecutionEntrySchema } from '../contracts/CommandSchema.ts';
import type {
  IChainedCommand,
  IEncodedAppliedMutation,
  InferCommand,
} from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IDrizzleRelationsFromModels,
  IResourceDrizzleSchemasFromModels,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import type {
  IAggregateId,
  IAnyModels,
  IEncodedResourceShape,
  InferPayloadInput,
  IRef,
} from '../models/types.ts';
import type { ISystemId } from '../system/types.ts';

import { type sessionRepoSchema } from './sessionRepoTables.ts';

export type ISessionRepoSchema = typeof sessionRepoSchema;

export type ISessionSchema<MODELS extends IAnyModels = IAnyModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & ISessionRepoSchema;

export type ISessionDrizzleDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<ISessionSchema<MODELS>, RELATIONS>>;

export type ISessionWaSqliteDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IWaSqliteDrizzleDb<IDbConfig<ISessionSchema<MODELS>, RELATIONS>>;

export type ISessionId = InferIdFromAbbreviation<'sesn'>;

export type IFrontendDelta = Readonly<{
  inserted: readonly IEncodedResourceShape[];
  updated: readonly IEncodedResourceShape[];
  deleted: readonly IRef[];
  mutations: readonly IEncodedAppliedMutation[];
}>;

export type IAggregateFrontendFinalizedCommand = Readonly<{
  userIndex: number;
  aggregateIndex: number;
  delta: IFrontendDelta;
  resolution: Schema.Schema.Type<typeof AggregateExecutionEntrySchema> | null;
}>;

/** Complete server-owned aggregate frontend state used for creation and repair. */
export type IAggregateFrontendSyncState = Readonly<{
  aggregateId: IAggregateId;
  userId: string;
  systemId: ISystemId;
  aggregateName: string;
  aggregateVersion: string;
  resolutions: readonly Schema.Schema.Type<
    typeof AggregateExecutionEntrySchema
  >[];
  frontendName: string;
  aggregateIndex: number;
  userIndex: number;
  resources: readonly IEncodedResourceShape[];
}>;

export interface IInitializedSessionState<
  MODELS extends IAnyModels = IAnyModels,
> {
  sessionId: ISessionId;
  aggregateId: IAggregateId;
  aggregateName: string;
  userId: string;
  systemId: ISystemId;
  frontendName: string;
  aggregateFrontendLockKey: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  aggregateIndex: number;
  userIndex: number;
  pushIndex: number;
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
}

type IUninitializedSessionState = {
  sessionId: ISessionId;
  aggregateId: null;
  aggregateName: null;
  userId: null;
  systemId: null;
  frontendName: null;
  aggregateFrontendLockKey: null;
  db: null;
  schema: null;
  models: null;
  isInitialized: false;
  aggregateIndex: null;
  userIndex: null;
  pushIndex: null;
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
};

export type ISessionState<MODELS extends IAnyModels = IAnyModels> =
  | IInitializedSessionState<MODELS>
  | IUninitializedSessionState;

type ISessionStoreApi<MODELS extends IAnyModels = IAnyModels> = StoreApi<
  ISessionState<MODELS>
>;

export type ISession<
  FRONTEND extends IAggregateFrontendController = IAggregateFrontendController,
> = {
  frontend: FRONTEND;

  /**
   * One-shot readiness callback. Registration after initialization invokes
   * the handler synchronously; registration before it fires once in the next
   * microtask after the initialized transition. Success-only: a failed
   * bootstrap never fires it. Returns an unsubscribe for pending handlers.
   */
  onInitialized(
    handler: (props: {
      state: IInitializedSessionState<InferFrontendModels<FRONTEND>>;
    }) => void,
  ): () => void;
  readonly sessionId: ISessionId;
  executeCommand<
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<
      NonNullable<
        FRONTEND['contracts'][CONTRACT_NAME]['contract']['__payloads']
      >[FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']]
    >;
  }): IEncodedResult<
    IChainedCommand<
      InferCommand<
        FRONTEND['contracts'][CONTRACT_NAME]['contract'],
        FRONTEND['contracts'][CONTRACT_NAME]['contract']['version']
      >,
      IFrontendDelta
    > &
      Readonly<{ sessionIndex: number }>,
    IAnyErrorJson
  >;
  store: ISessionStoreApi<InferFrontendModels<FRONTEND>>;
};
