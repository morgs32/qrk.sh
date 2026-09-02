import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { InferIdFromAbbreviation } from '@zerospin/schema';
import type { AnyRelations } from 'drizzle-orm';
import type { StoreApi } from 'zustand';

import type {
  IAggregateCommand,
  IChainedCommand,
  IEncodedAppliedMutation,
  InferCommand,
  IServiceCommand,
  ISessionCommand,
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
  IEncodedResourceShape,
  IModels,
  InferPayloadInput,
  IRef,
} from '../models/types.ts';
import type { ISystemId } from '../system/types.ts';

import { type sessionRepoSchema } from './sessionRepoTables.ts';

export type ISessionRepoSchema = typeof sessionRepoSchema;

export type ISessionSchema<MODELS extends IModels = IModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & ISessionRepoSchema;

export type ISessionDrizzleDb<
  MODELS extends IModels = IModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<ISessionSchema<MODELS>, RELATIONS>>;

export type ISessionWaSqliteDb<
  MODELS extends IModels = IModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IWaSqliteDrizzleDb<IDbConfig<ISessionSchema<MODELS>, RELATIONS>>;

export type ISessionId = InferIdFromAbbreviation<'sesn'>;

export type IFrontendDelta = Readonly<{
  inserted: readonly IEncodedResourceShape[];
  updated: readonly IEncodedResourceShape[];
  deleted: readonly IRef[];
  mutations: readonly IEncodedAppliedMutation[];
}>;

export type IAggregateFrontendPushedCommand = IChainedCommand<
  ISessionCommand,
  IFrontendDelta
> &
  Readonly<{ pushIndex: number }>;

export type IAggregateFrontendFinalizedCommand =
  | (IChainedCommand<IAggregateCommand, IFrontendDelta> &
      Readonly<{
        aggregateIndex: number;
        frontendIndex: number;
      }>)
  | (IChainedCommand<IServiceCommand, IFrontendDelta> &
      Readonly<{
        aggregateIndex: number;
        serviceIndex: number;
        frontendIndex: number;
      }>);

/** Complete server-owned aggregate frontend state used for creation and repair. */
export type IAggregateFrontendSyncState = Readonly<{
  aggregateId: IAggregateId;
  userId: string;
  systemId: ISystemId;
  systemVersion: string;
  aggregateName: string;
  frontendName: string;
  aggregateIndex: number;
  frontendIndex: number;
  pushIndex: number;
  resolvedPushIndexes: readonly number[];
  resources: readonly IEncodedResourceShape[];
}>;

export interface IInitializedSessionState<MODELS extends IModels = IModels> {
  sessionId: ISessionId;
  aggregateId: IAggregateId;
  aggregateName: string;
  userId: string;
  systemId: ISystemId;
  systemVersion: string;
  frontendName: string;
  aggregateFrontendLockKey: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  aggregateIndex: number;
  frontendIndex: number;
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
  systemVersion: null;
  frontendName: null;
  aggregateFrontendLockKey: null;
  db: null;
  schema: null;
  models: null;
  isInitialized: false;
  aggregateIndex: null;
  frontendIndex: null;
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

export type ISessionState<MODELS extends IModels = IModels> =
  | IInitializedSessionState<MODELS>
  | IUninitializedSessionState;

type ISessionStoreApi<MODELS extends IModels = IModels> = StoreApi<
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
  sessionId: ISessionId;
  executeCommand<
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<FRONTEND['contracts'][CONTRACT_NAME]['payload']>;
  }): IEncodedResult<
    IChainedCommand<
      InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>,
      IFrontendDelta
    > &
      Readonly<{ sessionIndex: number }>,
    IAnyErrorJson
  >;
  store: ISessionStoreApi<InferFrontendModels<FRONTEND>>;
};
