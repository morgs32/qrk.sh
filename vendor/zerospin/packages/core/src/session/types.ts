import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type {
  CuidFactory,
  InferIdFromAbbreviation,
  IShape,
} from '@zerospin/schema';
import type { AnyRelations } from 'drizzle-orm';
import type { Effect, ManagedRuntime, Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type {
  IChainedCommand,
  ICommand,
  IEncodedCommand,
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
import type { initializeGuards } from '../guards/initializeGuards.ts';
import type {
  IAggregateId,
  IAnyModels,
  IEncodedResourceShape,
  IModel,
  IRef,
} from '../models/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

import type { SessionCommandSchema } from './AggregateSelectedCommandSchema.ts';
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
  upserted: readonly IEncodedResourceShape[];
  deleted: readonly IRef[];
}>;

export type IAggregateSelectedCommand = Readonly<{
  id: ICommand['id'];
  selectionIndex: number;
  aggregateIndex: number;
  delta: IFrontendDelta;
  failure: IAnyErrorJson | null;
  selectionHash: string;
}>;

/** Complete server-owned aggregate frontend state used for creation and repair. */
export type IAggregateFrontendSnapshot = Readonly<{
  aggregateId: IAggregateId;
  authentication: Readonly<Record<string, unknown>>;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateIndex: number;
  selectionIndex: number;
  selectionHash: string;
  selectedCommands: readonly IAggregateSelectedCommand[];
  resources: readonly IEncodedResourceShape[];
}>;

export interface IInitializedSessionState<
  MODELS extends IAnyModels = IAnyModels,
  AUTHENTICATION = Readonly<Record<string, unknown>>,
> {
  sessionId: ISessionId;
  aggregateId: IAggregateId;
  aggregateName: string;
  authentication: AUTHENTICATION;
  frontendName: string;
  aggregateFrontendLockKey: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  aggregateIndex: number;
  selectionIndex: number;
  selectionHash: string;
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
  sessionId: null;
  aggregateId: null;
  aggregateName: null;
  authentication: null;
  frontendName: null;
  aggregateFrontendLockKey: null;
  db: null;
  schema: null;
  models: null;
  isInitialized: false;
  aggregateIndex: null;
  selectionIndex: null;
  selectionHash: null;
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

export type ISessionState<
  MODELS extends IAnyModels = IAnyModels,
  AUTHENTICATION = Readonly<Record<string, unknown>>,
> =
  | IInitializedSessionState<MODELS, AUTHENTICATION>
  | IUninitializedSessionState;

type ISessionStoreApi<
  MODELS extends IAnyModels = IAnyModels,
  AUTHENTICATION = Readonly<Record<string, unknown>>,
> = StoreApi<ISessionState<MODELS, AUTHENTICATION>>;

export type IAggregateSession<
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
      state: IInitializedSessionState<
        InferFrontendModels<FRONTEND>,
        FRONTEND['authentication']['authenticationSchema']['Type']
      >;
    }) => void,
  ): () => void;
  readonly sessionId: ISessionId | null;
  /** Generate a model ID synchronously with the bound session runtime; failures throw. */
  makeId<ATTRIBUTES extends IShape, ABBREVIATION extends string>(
    model: IModel<ATTRIBUTES, ABBREVIATION>,
  ): InferIdFromAbbreviation<ABBREVIATION>;
  /**
   * Bind guard/runtime/delivery resources before publishing readiness.
   * Cleared during disposal; staging fails while unbound.
   */
  setExecutionResources(resources: {
    sessionId: ISessionId;
    /** Standalone commands settle locally without retaining active optimism. */
    settleLocally?: boolean;
    guards: Effect.Success<
      ReturnType<typeof initializeGuards<never, unknown, unknown>>
    >;
    runtime: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
    executeAggregateFrontendCommand?: (props: {
      command: IEncodedCommand<
        IChainedCommand<
          ISessionCommand,
          NonNullable<Schema.Schema.Type<typeof SessionCommandSchema>['delta']>
        > &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      >;
    }) => Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
  }): void;
  clearExecutionResources(): void;
  store: ISessionStoreApi<
    InferFrontendModels<FRONTEND>,
    FRONTEND['authentication']['authenticationSchema']['Type']
  >;
};
