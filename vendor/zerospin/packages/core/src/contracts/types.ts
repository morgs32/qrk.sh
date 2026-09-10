/* oxlint-disable typescript/no-explicit-any -- payload/mutation/guard erased defaults */
import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import {
  type IAnyShape,
  type IEncodedShape,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from '@zerospin/schema';
import type { Effect } from 'effect';

import type {
  IAnyModels,
  IModel,
  IModelReplica,
  IModelSpec,
  InferCommandPayload,
  InferPayloadInput,
  InferResource,
} from '../models/types.ts';

import type { ICreateMutation } from './createMutation.ts';
import type { IDeleteMutation } from './deleteMutation.ts';
import type { IMutations, InferContractProgram } from './makeVersion.ts';
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
    lastAppliedAt: Date | null;
    inverseOperation: IInverseOperation | null;
  }>;

export type IAnyContracts<GUARD_REQUIREMENTS = any> = Readonly<
  Record<
    string,
    IContract<
      string,
      IAnyShape,
      string,
      IMutations,
      Record<string, IAnyShape>,
      (...args: any[]) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>
    >
  >
>;

export type IContractBinding<
  CONTRACT extends IContract = IContract,
  GUARD extends (...args: any[]) => Effect.Effect<void, IAnyError, any> = (
    ...args: any[]
  ) => Effect.Effect<void, IAnyError, any>,
> = Readonly<{
  contract: CONTRACT;
  guard?: GUARD;
}>;

export type IAnyContractBindings<GUARD_REQUIREMENTS = any> = Readonly<
  Record<
    string,
    IContractBinding<
      IAnyContracts<GUARD_REQUIREMENTS>[string],
      (...args: any[]) => Effect.Effect<void, IAnyError, GUARD_REQUIREMENTS>
    >
  >
>;

// --- Contracts & validation

export type IContractSpec = Readonly<{
  commandName: string;
  version: string;
  payloadShape: Readonly<IEncodedShape>;
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
  lastAppliedAt: Date | null;
  inverseOperation: string;
}>;

export interface IContract<
  COMMAND_NAME extends string = string,
  PAYLOAD extends IAnyShape = IAnyShape,
  VERSION extends string = string,
  MUTATIONS = IMutations,
  PAYLOADS extends Record<string, IAnyShape> = { [K in VERSION]: PAYLOAD },
  GUARD extends (...args: any[]) => Effect.Effect<void, IAnyError, any> = (
    ...args: any[]
  ) => Effect.Effect<void, IAnyError, any>,
  MODELS extends IAnyModels = IAnyModels,
  HISTORICAL_GUARD_REQUIREMENTS = Effect.Services<ReturnType<GUARD>>,
> {
  readonly models: MODELS;
  readonly previous: IContract | undefined;
  readonly next: IContract | undefined;
  readonly guard?: GUARD;
  readonly commandName: COMMAND_NAME;
  readonly payload: PAYLOAD;
  readonly __payloads?: PAYLOADS;
  adaptPayload<
    FROM extends keyof PAYLOADS & string,
    TO extends keyof PAYLOADS & string,
  >(props: {
    fromVersion: FROM;
    toVersion: TO;
    payload: IAnyShape extends PAYLOADS[FROM]
      ? any
      : InferCommandPayload<PAYLOADS[FROM]>;
  }): Effect.Effect<
    IAnyShape extends PAYLOADS[TO] ? any : InferCommandPayload<PAYLOADS[TO]>,
    IAnyError
  >;
  readonly decodePayload: (props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: string;
      readonly id: string;
      readonly payload: string;
    };
  }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
  readonly encodePayload: {
    bivarianceHack<SOURCE_VERSION extends keyof PAYLOADS & string>(props: {
      version: SOURCE_VERSION;
      payload: IAnyShape extends PAYLOADS[SOURCE_VERSION]
        ? any
        : InferCommandPayload<PAYLOADS[SOURCE_VERSION]>;
    }): Effect.Effect<string, IAnyError>;
  }['bivarianceHack'];
  readonly validatePayload: {
    bivarianceHack<SOURCE_VERSION extends keyof PAYLOADS & string>(props: {
      version: SOURCE_VERSION;
      payload: IAnyShape extends PAYLOADS[SOURCE_VERSION]
        ? any
        : InferPayloadInput<PAYLOADS[SOURCE_VERSION]>;
    }): Effect.Effect<
      IAnyShape extends PAYLOADS[SOURCE_VERSION]
        ? any
        : InferCommandPayload<PAYLOADS[SOURCE_VERSION]>,
      IAnyError
    >;
  }['bivarianceHack'];
  readonly version: VERSION;
  readonly program: InferContractProgram<PAYLOAD, MUTATIONS>;
  readonly spec: IContractSpec;
  readonly getVersion: (
    contractVersion: string,
  ) => IContract<
    COMMAND_NAME,
    IAnyShape,
    string,
    MUTATIONS,
    Record<string, IAnyShape>,
    NonNullable<IAnyContracts<HISTORICAL_GUARD_REQUIREMENTS>[string]['guard']>,
    IAnyModels,
    HISTORICAL_GUARD_REQUIREMENTS
  >;
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
> = ISessionCommand<
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
    aggregateId: string;
    aggregateName: AGGREGATE_NAME;
    systemName: SYSTEM_NAME;
  }> &
  (
    | Readonly<{
        aggregateVersion: string;
        sessionId: null;
        userId: null;
        frontendName: null;
        pushIndex: null;
      }>
    | Readonly<{
        sessionId: ISessionId;
        userId: string;
        frontendName: string;
        pushIndex: number | null;
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

export type ISessionCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    aggregateId: string;
    aggregateName: string;
    systemName: string;
    userId: string;
    frontendName: string;
    sessionId: ISessionId;
    pushIndex: number | null;
  }>;

/** One flat occurrence in a command chain. */
export type IChainedCommand<
  COMMAND extends ICommand = ICommand,
  DELTA = unknown,
> = COMMAND &
  Readonly<{ chainedAt: Date }> &
  (
    | Readonly<{
        delta: null;
        failedAt: null;
        failure: null;
      }>
    | Readonly<{
        delta: DELTA;
        failedAt: null;
        failure: null;
      }>
    | Readonly<{
        delta: DELTA;
        failedAt: Date;
        failure: IAnyErrorJson;
      }>
  );
