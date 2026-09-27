import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type {
  CuidFactory,
  InferIdFromAbbreviation,
  IShape,
} from '@zerospin/schema';
import type { AnyRelations } from 'drizzle-orm';
import {
  type Effect,
  type ManagedRuntime,
  type Schema,
  type Scope,
} from 'effect';
import type { StoreApi } from 'zustand';

import type { INodeState } from '../aggregateSession/NodeState.ts';
import type { AdmissionResultSchema } from '../contracts/AdmissionResultSchema.ts';
import type { ExecutionSummarySchema } from '../contracts/ExecutionSummarySchema.ts';
import type {
  IAnyContractBindings,
  IAnyContracts,
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
  IAggregateId,
  IAnyModels,
  IEncodedResourceShape,
  IModel,
  IRef,
} from '../models/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

import { type sessionRepoDbConfig } from './sessionRepoDbConfig.ts';

export type IAggregateSessionDefinition<
  SYSTEM_NAME extends string = string,
  AGGREGATE_NAME extends string = string,
  DEFINITION_NAME extends string = string,
  CONTRACTS extends IAnyContractBindings = IAnyContractBindings,
  MODELS extends IAnyModels = IAnyModels,
  AGGREGATE_VERSION extends string = string,
  CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
> = Readonly<{
  readonly __initializeRequirements?:
    | Effect.Services<
        ReturnType<CONTRACTS[keyof CONTRACTS]['contract']['program']>
      >
    | Effect.Services<
        ReturnType<NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>>
      >
    | Scope.Scope;
  kind: 'aggregate';
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  actorName: string;
  actorVersion: string;
  claimsSchema: CLAIMS;
  sessionName: DEFINITION_NAME;
  contracts: {
    readonly [COMMAND_NAME in keyof CONTRACTS]: Readonly<{
      contract: CONTRACTS[COMMAND_NAME]['contract'];
    }>;
  };
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;

export type IAnyAggregateSessionDefinition<INITIALIZE_REQUIREMENTS = never> =
  Readonly<{
    readonly __initializeRequirements?: INITIALIZE_REQUIREMENTS | Scope.Scope;
    kind: 'aggregate';
    systemName: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
    claimsSchema: Schema.Struct<
      Readonly<Record<string, Schema.Codec<unknown, unknown>>>
    >;
    sessionName: string;
    contracts: Readonly<
      Record<string, Readonly<{ contract: IAnyContracts[string] }>>
    >;
    models: Readonly<IAnyModels>;
    modelNames: readonly string[];
  }>;

export type ISessionRepoSchema = typeof sessionRepoDbConfig.schema;

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

export type IActorDelta = Readonly<{
  upserted: readonly IEncodedResourceShape[];
  deleted: readonly IRef[];
}>;

export type IAggregateActorCommand = Readonly<{
  nodeId: string | null;
  nodeIndex: number | null;
  /** Bound-version encoding for local persistence, present only on delivered business refusals. */

  id: ICommand['id'];
  executedIndex: number;
  aggregateIndex: number;
  actorDelta: IActorDelta;
  admission: typeof AdmissionResultSchema.Type | null;
  execution: typeof ExecutionSummarySchema.Type | null;
  executedHash: string;
}>;

/** Complete server-owned aggregate session state used for creation and repair. */
export type IAggregateSessionSnapshot = Readonly<{
  aggregateId: IAggregateId;
  claims: Readonly<Record<string, unknown>>;
  aggregateName: string;
  aggregateVersion: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  aggregateIndex: number;
  executedIndex: number;
  executedHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;

export interface IInitializedSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> {
  sessionId: ISessionId;
  aggregateId: IAggregateId;
  aggregateName: string;
  actorName: string;
  actorVersion: string;
  claims: CLAIMS;
  sessionName: string;
  aggregateSessionLockKey: string;
  db: IWaSqliteDrizzleDb<
    IDbConfig<ISessionSchema<MODELS>, IDrizzleRelationsFromModels<MODELS>>
  >;
  schema: ISessionSchema<MODELS>;
  models: MODELS;
  isInitialized: true;
  aggregateIndex: number;
  executedIndex: number;
  executedHash: string;
  pushIndex: number;
  sessionStatus:
    | 'bootstrapping'
    | 'current'
    | 'superseded'
    | 'failed'
    | 'released';
  nodeState?: INodeState | null;
  backupState: Readonly<{
    status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
    failure: IAnyError | IZerospinErrorJson | null;
  }> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
}

type IUninitializedSessionState = {
  sessionId: null;
  aggregateId: null;
  aggregateName: null;
  actorName: null;
  actorVersion: null;
  claims: null;
  sessionName: null;
  aggregateSessionLockKey: null;
  db: null;
  schema: null;
  models: null;
  isInitialized: false;
  aggregateIndex: null;
  executedIndex: null;
  executedHash: null;
  pushIndex: null;
  sessionStatus:
    | 'bootstrapping'
    | 'current'
    | 'superseded'
    | 'failed'
    | 'released';
  nodeState?: INodeState | null;
  backupState: Readonly<{
    status: 'pending' | 'ready' | 'repairing' | 'failed' | 'released';
    failure: IAnyError | IZerospinErrorJson | null;
  }> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
};

export type ISessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> = IInitializedSessionState<MODELS, CLAIMS> | IUninitializedSessionState;

type ISessionStoreApi<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> = StoreApi<ISessionState<MODELS, CLAIMS>>;

export type IAggregateSession<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = {
  definition: DEFINITION;

  /**
   * One-shot readiness callback. Registration after initialization invokes
   * the handler synchronously; registration before it fires once in the next
   * microtask after the initialized transition. Success-only: a failed
   * bootstrap never fires it. Returns an unsubscribe for pending handlers.
   */
  onInitialized(
    handler: (props: {
      state: IInitializedSessionState<
        DEFINITION['models'],
        DEFINITION['claimsSchema']['Type']
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
    runtime: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
    executeAggregateSessionCommand?: (props: {
      command: IEncodedCommand<
        ISessionCommand & Readonly<{ sessionIndex: number; pushIndex: null }>
      >;
    }) => Effect.Effect<
      Readonly<{ commandId: string }>,
      IAnyError | IZerospinErrorJson
    >;
  }): void;
  clearExecutionResources(): void;
  store: ISessionStoreApi<
    DEFINITION['models'],
    DEFINITION['claimsSchema']['Type']
  >;
};
