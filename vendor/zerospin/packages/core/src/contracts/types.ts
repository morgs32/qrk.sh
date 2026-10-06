/* oxlint-disable typescript/no-explicit-any -- payload/operation/guard erased defaults */
import type { IAnyError, IFrameworkError, IScopedError } from '@zerospin/error';
import {
  type IAnyShape,
  type IEncodedShape,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from '@zerospin/shapes';
import type { Effect, Schema } from 'effect';

import type { StagingResultSchema } from '../aggregateSession/StagingResultSchema.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyModels,
  IModel,
  IModelSpec,
  InferCommandPayload,
  InferResource,
} from '../models/types.ts';

import type { AdmissionResultSchema } from './AdmissionResultSchema.ts';
import type { ICreateOperation } from './createOperation.ts';
import type { IDeleteOperation } from './deleteOperation.ts';
import type { ExecutionResultSchema } from './ExecutionResultSchema.ts';
import type { IExternalContractDefinition } from './externalContract.ts';
import type { FailureJson, FailureType, IFailures } from './failures.ts';
import type { InferContractProgram } from './make/makeContractVersion.ts';
import type {
  IAsyncOperation,
  IContractMapping,
} from './make/mapContractVersion.ts';
import type { IMoveOperation } from './moveOperation.ts';
import type {
  InferEmittedOperations,
  IOperationSink,
} from './operationSink.ts';
import type { ServiceCallerSchema } from './ServiceCallerSchema.ts';
import type { IUpdateOperation } from './updateOperation.ts';
export interface IModelOperations<MODEL extends IModel> {
  create(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly attributes: InferDecodedRow<MODEL['attributes']>;
  }): Effect.Effect<
    void,
    IAnyError,
    IOperationSink<
      string extends MODEL['version']
        ? any
        : ICreateOperation<MODEL, MODEL['attributes']>
    >
  >;
  update(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly attributes: Partial<InferDecodedRow<MODEL['attributes']>>;
    readonly mask?: ReadonlyArray<
      keyof InferDecodedRow<MODEL['attributes']> & string
    >;
  }): Effect.Effect<
    void,
    IAnyError,
    IOperationSink<
      string extends MODEL['version']
        ? any
        : IUpdateOperation<MODEL, MODEL['attributes']>
    >
  >;
  delete(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
  }): Effect.Effect<
    void,
    IAnyError,
    IOperationSink<
      string extends MODEL['version'] ? any : IDeleteOperation<MODEL>
    >
  >;
  move(props: {
    readonly resourceId: InferIdFromAbbreviation<MODEL['abbreviation']>;
    readonly property: string;
    readonly prevId: string;
    readonly nextId: string;
  }): Effect.Effect<
    void,
    IAnyError,
    IOperationSink<
      string extends MODEL['version'] ? any : IMoveOperation<MODEL>
    >
  >;
}
export type IOperationName = 'create' | 'delete' | 'move' | 'update';
type InferModelAttributesShape<MODEL extends IModel> = MODEL['attributes'];
export type IOperation<
  MODEL extends IModel = IModel,
  OPERATION_NAME extends IOperationName = IOperationName,
> = Extract<
  | ICreateOperation<MODEL>
  | IUpdateOperation<MODEL>
  | IDeleteOperation<MODEL>
  | IMoveOperation<MODEL>,
  {
    operationName: OPERATION_NAME;
  }
>;
/** Unfinalized operation union from contract programs; applyOperationTx adds apply metadata. */
export type IAnyOperation = IOperation<IModel, IOperationName>;
export type IContractOutput = IAnyOperation | IAsyncOperation;
/** Pre-apply snapshot for undoing an applied operation. */
export type IInverseOperation =
  | Readonly<{
      attributes: Partial<InferDecodedRow<InferModelAttributesShape<IModel>>>;
    }>
  | Readonly<{
      resource: InferResource<IModel>;
    }>
  | Readonly<{
      property: string;
      prevId: string;
    }>;
export type IAppliedOperation = IAnyOperation &
  Readonly<{
    commandId: string;
    operationIndex: number;
    appliedAt: Date;
    previousUpdatedAt: Date | null;
    inverseOperation: IInverseOperation | null;
  }>;
export type IAnyContracts = Readonly<
  Record<
    string,
    IContract<string, IAnyShape, string, unknown, Record<string, IAnyShape>>
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
  resultJsonSchema: unknown;
  models: Readonly<Record<string, IModelSpec>>;
}>;
/** Encoded optimistic operation before worker application adds apply metadata. */
export type IEncodedOperation = Readonly<{
  commandId: string;
  operationIndex: number;
  modelName: string;
  modelVersion: string;
  resourceId: string;
  operationName: IOperationName;
  body: string;
}>;
/** Encoded applied operation at persistence, ledger, and rollback boundaries. */
export type IEncodedAppliedOperation = Readonly<{
  commandId: string;
  operationIndex: number;
  modelName: string;
  modelVersion: string;
  resourceId: string;
  operationName: IOperationName;
  body: string;
  appliedAt: Date;
  previousUpdatedAt: Date | null;
  inverseOperation: string;
}>;
export interface IContract<
  COMMAND_NAME extends string = string,
  PAYLOAD extends IAnyShape = IAnyShape,
  VERSION extends string = string,
  RESULT = unknown,
  PAYLOADS extends Record<string, IAnyShape> = {
    [K in VERSION]: PAYLOAD;
  },
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
  readonly mapping?: IContractMapping;
  readonly external?: IExternalContractDefinition;
  readonly claims?: CLAIMS;
  readonly guard?: {
    bivarianceHack(
      props: Omit<Parameters<InferContractProgram<PAYLOAD>>[0], 'db'> & {
        response?: unknown;
        failures: FAILURE;
        db: string extends keyof MODELS
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
      | IFrameworkError
      | Extract<
          FailureType<FAILURE>,
          {
            scope: 'contract';
          }
        >,
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
        RESULT,
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
    RESULT,
    PROGRAM_REQUIREMENTS,
    PROGRAM_ERROR,
    MODELS
  >;
  readonly spec: IContractSpec;
  readonly __operations?: unknown extends PROGRAM_REQUIREMENTS
    ? IContractOutput
    : InferEmittedOperations<PROGRAM_REQUIREMENTS>;
  readonly result?: Schema.Codec<RESULT, unknown>;
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
  response?: typeof Schema.Json.Type;
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
  Readonly<{
    pushIndex: null;
  }>;
export type IAggregateCommand<
  COMMAND extends ICommand = ICommand,
  AGGREGATE_NAME extends string = string,
  SYSTEM_NAME extends string = string,
> = COMMAND &
  Readonly<{
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
    caller: typeof ServiceCallerSchema.Type | null;
  }>;
export type ISessionCommandInput<COMMAND extends ICommand = ICommand> = Omit<
  COMMAND,
  'response'
> &
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
/** A successfully staged session command owns its original local result. */
export type ISessionCommand<
  COMMAND extends ICommand = ICommand,
  RESULT = typeof Schema.Json.Type,
> = ISessionCommandInput<COMMAND> &
  Readonly<{
    sessionIndex: number;
    staging: Omit<typeof StagingResultSchema.Type, 'result'> & {
      readonly result: RESULT;
    };
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

export type InferContractResult<CONTRACT extends IContract> = Effect.Success<
  ReturnType<CONTRACT['program']>
>;
export type InferContractOperations<CONTRACT extends IContract> = NonNullable<
  CONTRACT['__operations']
>;
