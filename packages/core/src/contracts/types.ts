/* oxlint-disable typescript/no-explicit-any -- payload/mutation/guard erased defaults */
import type { IAnyError, IFrameworkError, IScopedError } from '@zerospin/error';
import {
  type IAnyShape,
  type IEncodedShape,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from '@zerospin/schema';
import type { Effect, Schema } from 'effect';

import type { StagingResultSchema } from '../aggregateSession/StagingResultSchema.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyModels,
  IModel,
  IModelReplica,
  IModelSpec,
  InferCommandPayload,
  InferResource,
} from '../models/types.ts';

import type { AdmissionResultSchema } from './AdmissionResultSchema.ts';
import type { ICreateMutation } from './createMutation.ts';
import type { IDeleteMutation } from './deleteMutation.ts';
import type { ExecutionResultSchema } from './ExecutionResultSchema.ts';
import type { ExecutionSummarySchema } from './ExecutionSummarySchema.ts';
import type { FailureJson, FailureType, IFailures } from './failures.ts';
import type {
  IMutations,
  InferContractProgram,
} from './make/makeContractVersion.ts';
import type { IMoveMutation } from './moveMutation.ts';
import type { IReplicateMutation } from './replicate.ts';
import type { IUpdateMutation } from './updateMutation.ts';

export interface IModelMutations<MODEL extends IModel> {
  create(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly attributes: InferDecodedRow<MODEL['attributes']>;
  }): Effect.Effect<
    string extends MODEL['version']
      ? any
      : ICreateMutation<MODEL, MODEL['attributes']>,
    IAnyError
  >;

  update(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly attributes: Partial<InferDecodedRow<MODEL['attributes']>>;
    readonly mask?: ReadonlyArray<
      keyof InferDecodedRow<MODEL['attributes']> & string
    >;
  }): Effect.Effect<
    string extends MODEL['version']
      ? any
      : IUpdateMutation<MODEL, MODEL['attributes']>,
    IAnyError
  >;

  delete(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  }): Effect.Effect<
    string extends MODEL['version'] ? any : IDeleteMutation<MODEL>,
    IAnyError
  >;

  move(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly property: string;
    readonly prevId: string;
    readonly nextId: string;
  }): Effect.Effect<
    string extends MODEL['version'] ? any : IMoveMutation<MODEL>,
    IAnyError
  >;

  replicate(
    resource: string extends MODEL['version']
      ? InferResource<IModel>
      : MODEL extends IModelReplica
        ? InferDecodedRow<MODEL['sourceModel']['propertiesShape']>
        : never,
  ): Effect.Effect<
    string extends MODEL['version'] ? any : IReplicateMutation<MODEL>,
    IAnyError
  >;
}

export type IOperationName =
  | 'create'
  | 'delete'
  | 'move'
  | 'replicate'
  | 'update';

type InferModelAttributesShape<MODEL extends IModel> = MODEL['attributes'];

export type IMutation<
  MODEL extends IModel = IModel,
  OPERATION_NAME extends IOperationName = IOperationName,
> = Extract<
  | ICreateMutation<MODEL>
  | IUpdateMutation<MODEL>
  | IDeleteMutation<MODEL>
  | IMoveMutation<MODEL>
  | IReplicateMutation<MODEL>,
  { operationName: OPERATION_NAME }
>;

/** Unfinalized mutation union from contract programs; applyMutationTx adds apply metadata. */
export type IAnyMutation = IMutation<IModel, IOperationName>;

/** Pre-apply snapshot for undoing an applied mutation. */
export type IInverseOperation =
  | Readonly<{
      attributes: Partial<InferDecodedRow<InferModelAttributesShape<IModel>>>;
    }>
  | Readonly<{ resource: InferResource<IModel> }>
  | Readonly<{ property: string; prevId: string }>;

export type IAppliedMutation = IAnyMutation &
  Readonly<{
    commandId: string;
    mutationIndex: number;
    appliedAt: Date;
    previousUpdatedAt: Date | null;
    inverseOperation: IInverseOperation | null;
  }>;

export type IAnyContracts = Readonly<
  Record<
    string,
    IContract<string, IAnyShape, string, IMutations, Record<string, IAnyShape>>
  >
>;

/** Discriminated domain values; framework failures use their own reserved tag. */
export type IBusinessFailure = IScopedError;
export type IContractFailure = IAnyError | IBusinessFailure;
export type InferFailure<
  CONTRACT extends IContract,
  VERSION extends keyof NonNullable<CONTRACT['__failures']> & string =
    CONTRACT['version'],
> = FailureType<NonNullable<CONTRACT['__failures']>[VERSION]>;

export type InferFailureJson<CONTRACT extends IContract> = FailureJson<
  CONTRACT['failures']
>;

// --- Contracts & validation

export type IContractSpec = Readonly<{
  commandName: string;
  version: string;
  payloadShape: Readonly<IEncodedShape>;
  failureJsonSchema: unknown;
  models: Readonly<Record<string, IModelSpec>>;
}>;

/** Encoded optimistic mutation before worker application adds apply metadata. */
export type IEncodedMutation = Readonly<{
  commandId: string;
  mutationIndex: number;
  modelName: string;
  modelVersion: string;
  resourceId: string;
  operationName: IOperationName;
  operation: string;
}>;

/** Encoded applied mutation at persistence, ledger, and rollback boundaries. */
export type IEncodedAppliedMutation = Readonly<{
  commandId: string;
  mutationIndex: number;
  modelName: string;
  modelVersion: string;
  resourceId: string;
  operationName: IOperationName;
  operation: string;
  appliedAt: Date;
  previousUpdatedAt: Date | null;
  inverseOperation: string;
}>;

export interface IContract<
  COMMAND_NAME extends string = string,
  PAYLOAD extends IAnyShape = IAnyShape,
  VERSION extends string = string,
  MUTATIONS = IMutations,
  PAYLOADS extends Record<string, IAnyShape> = { [K in VERSION]: PAYLOAD },
  MODELS extends IAnyModels = IAnyModels,
  PROGRAM_REQUIREMENTS = unknown,
  PROGRAM_ERROR extends IContractFailure = IContractFailure,
  HISTORICAL_PROGRAM_REQUIREMENTS = PROGRAM_REQUIREMENTS,
  FAILURE extends IFailures = IFailures,
  FAILURES extends Record<string, IFailures> = Record<string, FAILURE>,
  CLAIMS extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = Schema.Codec<Readonly<Record<string, unknown>> | null, unknown>,
> {
  readonly claims?: CLAIMS;
  readonly guard?: {
    bivarianceHack(
      props: Parameters<InferContractProgram<PAYLOAD>>[0] & {
        failures: FAILURE;
        queryDb: string extends keyof MODELS
          ? Readonly<Pick<IDb, 'query'>>
          : Readonly<
              Pick<
                IDb<IResourceDbConfig<MODELS, Record<never, never>>>,
                'query'
              >
            >;
      },
    ): Effect.Effect<
      void,
      IFrameworkError | Extract<FailureType<FAILURE>, { scope: 'contract' }>,
      PROGRAM_REQUIREMENTS
    >;
  }['bivarianceHack'];
  readonly failures: FAILURE;
  readonly __failures?: FAILURES;

  readonly models: MODELS;
  readonly previous:
    | IContract<
        COMMAND_NAME,
        IAnyShape,
        string,
        MUTATIONS,
        Record<string, IAnyShape>,
        IAnyModels,
        HISTORICAL_PROGRAM_REQUIREMENTS
      >
    | undefined;
  readonly next: IContract | undefined;
  readonly up:
    | ((props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>)
    | undefined;
  readonly down:
    | ((props: { payload: unknown }) => Effect.Effect<unknown, IAnyError>)
    | undefined;

  readonly commandName: COMMAND_NAME;
  readonly payload: PAYLOAD;
  readonly __payloads?: PAYLOADS;
  readonly version: VERSION;
  readonly program: InferContractProgram<
    PAYLOAD,
    MUTATIONS,
    PROGRAM_REQUIREMENTS,
    PROGRAM_ERROR
  >;
  readonly spec: IContractSpec;
  readonly __mutations?: MUTATIONS;
}

// --- Command pipeline types

export type ICommand<
  COMMAND_NAME extends string = string,
  CONTRACT_VERSION extends string = string,
  PAYLOAD = unknown,
> = Readonly<{
  id: InferIdFromAbbreviation<'cmd'>;
  commandName: COMMAND_NAME;
  contractVersion: CONTRACT_VERSION;
  payload: PAYLOAD;
}>;

export type ISessionId = InferIdFromAbbreviation<'sesn'>;

/** Encode payload to string immediately before persisting a command row. */
export type IEncodedCommand<COMMAND extends ICommand> = {
  readonly [KEY in keyof COMMAND]: KEY extends 'payload'
    ? string
    : COMMAND[KEY];
};

export type InferCommand<
  CONTRACT extends IContract,
  VERSION extends keyof NonNullable<CONTRACT['__payloads']> & string =
    CONTRACT['version'],
> = ISessionCommandInput<
  ICommand<
    CONTRACT['commandName'],
    VERSION,
    InferCommandPayload<NonNullable<CONTRACT['__payloads']>[VERSION]>
  >
> &
  Readonly<{ pushIndex: null }>;

export type IAggregateCommand<
  COMMAND extends ICommand = ICommand,
  AGGREGATE_NAME extends string = string,
  SYSTEM_NAME extends string = string,
> = COMMAND &
  Readonly<{
    automationName?: string | null;
    aggregateId: string;
    aggregateName: AGGREGATE_NAME;
    systemName: SYSTEM_NAME;
  }> &
  (
    | Readonly<{
        aggregateVersion: string;
        nodeId: null;
        claims: Readonly<Record<string, unknown>>;
        actorName: string;
        actorVersion: string;
        sessionName: null;
        nodeIndex: null;
      }>
    | Readonly<{
        nodeId: string;
        claims: Readonly<Record<string, unknown>>;
        actorName: string;
        actorVersion: string;
        sessionName: string;
        nodeIndex: number;
      }>
  );

export type IServiceCommand<
  COMMAND extends ICommand = ICommand,
  SERVICE_NAME extends string = string,
> = COMMAND &
  Readonly<{
    serviceName: SERVICE_NAME;
    serviceVersion: string;
  }>;

export type ISessionCommandInput<COMMAND extends ICommand = ICommand> =
  COMMAND &
    Readonly<{
      aggregateId: string;
      aggregateName: string;
      claims: Readonly<Record<string, unknown>>;
      actorName: string;
      actorVersion: string;
      sessionName: string;
      sessionId: ISessionId;
      pushIndex: number | null;
    }>;

/** A successfully staged session command owns its original local result and later server results. */
export type ISessionCommand<COMMAND extends ICommand = ICommand> =
  ISessionCommandInput<COMMAND> &
    Readonly<{
      sessionIndex: number;
      staging: typeof StagingResultSchema.Type;
      admission: typeof AdmissionResultSchema.Type;
      execution: typeof ExecutionSummarySchema.Type;
    }>;

export type IChainedCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    admission: typeof AdmissionResultSchema.Type;
    execution: typeof ExecutionResultSchema.Type;
  }>;

export type InferContractGuardRequirements<BINDINGS> = {
  [K in keyof BINDINGS]: BINDINGS[K] extends {
    readonly contract: infer CONTRACT extends IContract;
  }
    ? Effect.Services<ReturnType<NonNullable<CONTRACT['guard']>>>
    : never;
}[keyof BINDINGS];
