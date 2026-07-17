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
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
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
import type { ISignatureFactory } from '../utils/types.ts';

import type {
  sessionFailedCommandShape,
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

export type IFrontendState = {
  actorId: IActorId;
  systemWorkerName: string;
  accountName: string;
  actorName: string;
  frontendName: string;
  frontendIndex: number | null;
  lastRebasedPushedCursor: IPushedCursorId | null;
  pushedCommands: readonly InferEncodedRow<typeof sessionPushedCommandShape>[];
  resources: readonly IEncodedResourceShape[];
  executedPushedCommands: readonly IEncodedCommand<IExecutedPushedCommand>[];
  failedPushedCommands: readonly (
    | IEncodedCommand<IFailedPushedCommand>
    | InferEncodedRow<typeof sessionFailedCommandShape>
  )[];
};

export type IFrontendReplicaState = IFrontendState & {
  stagedCommands: readonly InferEncodedRow<typeof sessionStagedCommandShape>[];
};

export interface IInitializedSessionState<MODELS extends IModels = IModels> {
  sessionId: ISessionId;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  vfsName: string | null;
  isInitialized: true;
  /** FrontendRepo convergence index for the next frontend block. */
  frontendIndex: number | null;
  /** FrontendRepo pushed cursor already represented in local resource rows. */
  lastRebasedPushedCursor: IPushedCursorId | null;
  isPushPaused: boolean;
  isSharedWorkerEnabled: boolean;
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
  generationId: null;
  systemVersion: null;
  systemWorkerName: null;
  db: null;
  schema: null;
  models: null;
  vfsName: null;
  isInitialized: false;
  isPushPaused: boolean;
  isSharedWorkerEnabled: boolean;
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
