import type { IAnyErrorJson } from '@zerospin/error';
import type {
  ITelemetryBatch,
  ITelemetryCollector,
  ITraceId,
} from '@zerospin/logger';
import type { AnyRelations } from 'drizzle-orm';
import type { Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type {
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IFailedStagedCommand,
  InferCommand,
  IPushedCommand,
  IStagedCommand,
} from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IDrizzleRelationsFromModels,
  IResourceDrizzleSchemasFromModels,
  IWaSqliteDrizzleDb,
} from '../drizzle/types.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import type {
  IAccountCursor,
  IAccountId,
  IActorId,
  IEncodedResourceShape,
  IModels,
  InferEncodedRow,
  InferIdFromAbbreviation,
  InferPayloadInput,
  IPushedCursorId,
  IRef,
} from '../models/types.ts';
import type { ISystemId } from '../system/types.ts';
import type { ISignatureFactory } from '../utils/types.ts';

import type {
  sessionPushedCommandShape,
  sessionStagedCommandShape,
} from './sessionCommandShape.ts';
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

export type IFrontendBlock = Readonly<{
  frontendName: string;
  lastAccountCursor: IAccountCursor;
  delta: IFrontendDelta;
  pendingPushedCommands: readonly IEncodedCommand<IPushedCommand>[];
  executedPushedCommands: readonly IEncodedCommand<IExecutedPushedCommand>[];
  failedPushedCommands: readonly IEncodedCommand<IFailedPushedCommand>[];
  /** Latest FrontendRepo pushed cursor already represented in `delta`. */
  lastRebasedPushedCursor: IPushedCursorId | null;
  /** Latest FrontendRepo convergence index applied by this session. */
  frontendIndex: number;
}>;

/** Complete server-owned account frontend state used for creation and repair. */
export type IFrontendSyncState = Readonly<{
  accountId: IAccountId;
  actorId: IActorId;
  systemId: ISystemId;
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  accountName: string;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
  lastRebasedPushedCursor: IPushedCursorId | null;
  pushedCommands: readonly InferEncodedRow<typeof sessionPushedCommandShape>[];
  resources: readonly IEncodedResourceShape[];
  executedPushedCommands: readonly IEncodedCommand<IExecutedPushedCommand>[];
  failedPushedCommands: readonly IEncodedCommand<IFailedPushedCommand>[];
}>;

/** Complete materialized account replica, including durable local intent. */
export type IFrontendReplicaState = IFrontendSyncState &
  Readonly<{
    frontendVersion: string;
    replicaIndex: number;
    stagedCommands: readonly InferEncodedRow<
      typeof sessionStagedCommandShape
    >[];
    failedStagedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
    optimisticAppliedMutations: readonly Readonly<{
      commandId: IEncodedCommand<IStagedCommand>['id'];
      mutations: readonly IEncodedAppliedMutation[];
    }>[];
  }>;

export type IFrontendGenerationBoundaryBlock = Readonly<{
  kind: 'generation-boundary';
  systemId: ISystemId;
  prevGenerationId: string;
  generationId: string;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendIndex: number;
}>;

export type IFrontendLineageBlock =
  | IFrontendGenerationBoundaryBlock
  | Readonly<{
      kind: 'frontend';
      systemId: ISystemId;
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendBlock: IFrontendBlock;
    }>;

/**
 * One committed SharedWorker transaction. Server and local command commits
 * share one contiguous replica index without conflating their payloads.
 */
export type IFrontendReplicaBlock =
  | Readonly<{
      kind: 'server';
      systemId: ISystemId;
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
      replicaIndex: number;
      frontendIndex: number;
      lineageBlock: IFrontendLineageBlock;
    }>
  | Readonly<{
      kind: 'local-command';
      systemId: ISystemId;
      generationId: string;
      accountId: IAccountId;
      accountName: string;
      actorId: IActorId;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
      replicaIndex: number;
      frontendIndex: number;
      delta: IFrontendDelta;
      stagedCommandsAdded: readonly IEncodedCommand<IStagedCommand>[];
      stagedCommandIdsRemoved: readonly IEncodedCommand<IStagedCommand>['id'][];
      pushedCommandsAdded: readonly IEncodedCommand<IPushedCommand>[];
      pushedCommandIdsRemoved: readonly IEncodedCommand<IPushedCommand>['id'][];
      executedPushedCommandsAdded: readonly IEncodedCommand<IExecutedPushedCommand>[];
      executedPushedCommandIdsRemoved: readonly IEncodedCommand<IExecutedPushedCommand>['id'][];
      failedStagedCommandsAdded: readonly IEncodedCommand<IFailedStagedCommand>[];
      failedPushedCommandsAdded: readonly IEncodedCommand<IFailedPushedCommand>[];
      failedCommandIdsRemoved: readonly (
        | IEncodedCommand<IFailedStagedCommand>['id']
        | IEncodedCommand<IFailedPushedCommand>['id']
      )[];
      optimisticAppliedMutationsAdded: readonly Readonly<{
        commandId: IEncodedCommand<IStagedCommand>['id'];
        mutations: readonly IEncodedAppliedMutation[];
      }>[];
      optimisticAppliedMutationCommandIdsRemoved: readonly IEncodedCommand<IStagedCommand>['id'][];
    }>;

export type IFrontendLineageTransitionRequired = Readonly<{
  kind: 'lineage-transition-required';
  systemId: ISystemId;
  generationId: string;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  frontendVersion: string;
  appliedBoundaryIndex: number;
  remainingBoundaries: readonly IFrontendGenerationBoundaryBlock[];
}>;

export interface IInitializedSessionState<MODELS extends IModels = IModels> {
  sessionId: ISessionId;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  systemId: ISystemId;
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  frontendName: string;
  frontendVersion: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  vfsName: string | null;
  isInitialized: true;
  /** FrontendRepo convergence index already committed to this session. */
  frontendIndex: number;
  /** SharedWorker-local committed transaction index; null in direct mode. */
  replicaIndex: number | null;
  /** FrontendRepo pushed cursor already represented in local resource rows. */
  lastRebasedPushedCursor: IPushedCursorId | null;
  isPushPaused: boolean;
  isSharedWorkerEnabled: boolean;
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
    frontendIndex: number | null;
    replicaIndex: number | null;
    databaseName: string | null;
    failure: IAnyErrorJson | null;
  }>;
  lastDevtoolsPush: Readonly<{
    traceId: ITraceId;
    completedAt: number;
    status: 'ok' | 'error';
  }> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
}

type IUninitializedSessionState = {
  sessionId: ISessionId;
  accountId: null;
  accountName: null;
  actorId: null;
  systemId: null;
  generationId: null;
  systemVersion: null;
  systemWorkerName: null;
  frontendName: null;
  frontendVersion: null;
  db: null;
  schema: null;
  models: null;
  vfsName: null;
  isInitialized: false;
  frontendIndex: null;
  replicaIndex: null;
  lastRebasedPushedCursor: null;
  isPushPaused: boolean;
  isSharedWorkerEnabled: boolean;
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
    bootstrapSource: null;
    frontendIndex: null;
    replicaIndex: null;
    databaseName: null;
    failure: IAnyErrorJson | null;
  }>;
  lastDevtoolsPush: Readonly<{
    traceId: ITraceId;
    completedAt: number;
    status: 'ok' | 'error';
  }> | null;
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
  FRONTEND extends IFrontendController = IFrontendController,
> = {
  frontend: FRONTEND;
  generateSignature: ISignatureFactory;
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
  }): Promise<
    Schema.EitherEncoded<
      IStagedCommand<InferCommand<FRONTEND['contracts'][CONTRACT_NAME]>>,
      IAnyErrorJson
    >
  >;
  store: ISessionStoreApi<InferFrontendModels<FRONTEND>>;
};
