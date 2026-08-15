import type { IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  InferCommand,
  IPushedCommand,
  IStagedReplicaCommand,
  IStagedSessionCommand,
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
  IAggregateCursor,
  IAggregateId,
  IEncodedResourceShape,
  IModels,
  InferEncodedRow,
  InferIdFromAbbreviation,
  InferPayloadInput,
  IRef,
} from '../models/types.ts';
import type { ISystemId } from '../system/types.ts';

import type { sessionPushedCommandShape } from './sessionCommandShape.ts';
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
}>;

export type IAggregateFrontendBlock = Readonly<{
  frontendName: string;
  lastAggregateCursor: IAggregateCursor;
  delta: IFrontendDelta;
  pendingPushedCommands: readonly IEncodedCommand<IPushedCommand>[];
  executedPushedCommands: readonly IEncodedCommand<IExecutedPushedCommand>[];
  failedPushedCommands: readonly IEncodedCommand<IFailedPushedCommand>[];
  /** Latest AggregateFrontendRepo convergence index applied by this session. */
  frontendIndex: number;
}>;

/** Complete server-owned aggregate frontend state used for creation and repair. */
export type IAggregateFrontendSyncState = Readonly<{
  aggregateId: IAggregateId;
  userId: string;
  systemId: ISystemId;
  systemVersion: string;
  aggregateName: string;
  frontendName: string;
  frontendIndex: number;
  pushedCommands: readonly InferEncodedRow<typeof sessionPushedCommandShape>[];
  resources: readonly IEncodedResourceShape[];
  executedPushedCommands: readonly IEncodedCommand<IExecutedPushedCommand>[];
  failedPushedCommands: readonly IEncodedCommand<IFailedPushedCommand>[];
}>;

/** Complete materialized aggregate replica, including durable local intent. */
export type IAggregateFrontendReplicaState = IAggregateFrontendSyncState &
  Readonly<{
    aggregateFrontendLockKey: string;
    replicaIndex: number;
    stagedCommands: readonly IEncodedCommand<IStagedReplicaCommand>[];
    failedStagedCommands: readonly (
      | IEncodedCommand<IFailedStagedReplicaCommand>
      | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
    )[];
    optimisticAppliedMutations: readonly Readonly<{
      commandId: IEncodedCommand<IStagedReplicaCommand>['id'];
      mutations: readonly IEncodedAppliedMutation[];
    }>[];
  }>;

/**
 * One committed SharedWorker transaction. Server and local command commits
 * share one contiguous replica index without conflating their payloads.
 */
export type IAggregateFrontendReplicaBlock =
  | Readonly<{
      kind: 'server';
      systemId: ISystemId;
      aggregateId: IAggregateId;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLockKey: string;
      replicaIndex: number;
      frontendIndex: number;
      frontendBlock: IAggregateFrontendBlock;
    }>
  | Readonly<{
      kind: 'local-command';
      systemId: ISystemId;
      aggregateId: IAggregateId;
      aggregateName: string;
      userId: string;
      frontendName: string;
      aggregateFrontendLockKey: string;
      replicaIndex: number;
      frontendIndex: number;
      delta: IFrontendDelta;
      stagedCommandsAdded: readonly IEncodedCommand<IStagedReplicaCommand>[];
      stagedCommandIdsRemoved: readonly IEncodedCommand<IStagedReplicaCommand>['id'][];
      pushedCommandsAdded: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommandIdsRemoved: readonly IEncodedCommand<IPushedCommand>['id'][];
      executedPushedCommandsAdded: readonly IEncodedCommand<IExecutedPushedCommand>[];
      executedPushedCommandIdsRemoved: readonly IEncodedCommand<IExecutedPushedCommand>['id'][];
      failedStagedCommandsAdded: readonly (
        | IEncodedCommand<IFailedStagedReplicaCommand>
        | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
      )[];
      failedPushedCommandsAdded: readonly IEncodedCommand<IFailedPushedCommand>[];
      failedCommandIdsRemoved: readonly (
        | IEncodedCommand<IFailedStagedReplicaCommand>['id']
        | IEncodedCommand<IFailedPushedCommand>['id']
      )[];
      optimisticAppliedMutationsAdded: readonly Readonly<{
        commandId: IEncodedCommand<IStagedReplicaCommand>['id'];
        mutations: readonly IEncodedAppliedMutation[];
      }>[];
      optimisticAppliedMutationCommandIdsRemoved: readonly IEncodedCommand<IStagedReplicaCommand>['id'][];
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
  vfsName: string | null;
  isInitialized: true;
  /** AggregateFrontendRepo convergence index already committed to this session. */
  frontendIndex: number;
  /** SharedWorker-local committed transaction index. */
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
    frontendIndex: number | null;
    replicaIndex: number | null;
    databaseName: string | null;
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
  vfsName: null;
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
    bootstrapSource: null;
    frontendIndex: null;
    replicaIndex: null;
    databaseName: null;
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
  stageCommand<
    CONTRACT_NAME extends keyof FRONTEND['contracts'] & string,
  >(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<FRONTEND['contracts'][CONTRACT_NAME]['payload']>;
  }): Schema.EitherEncoded<
    IStagedSessionCommand<InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>>,
    IAnyErrorJson
  >;
  store: ISessionStoreApi<InferFrontendModels<FRONTEND>>;
};
