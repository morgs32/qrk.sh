/* oxlint-disable typescript/no-explicit-any -- payload/mutation erased defaults */
import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import {
  type CuidFactory,
  type IAnyShape,
  type InferDecodedRow,
  type InferIdFromAbbreviation,
} from '@zerospin/schema';
import type { Effect, JsonSchema, Schema } from 'effect';

import type {
  IModel,
  InferCommandPayload,
  InferResource,
} from '../models/types.ts';

import type { ICreateMutation } from './createMutation.ts';
import type { IDeleteMutation } from './deleteMutation.ts';
import type { InferContractProgram } from './makeContract.ts';
import type { IMoveMutation } from './moveMutation.ts';
import type { IReplicateResourceMutation } from './replicateResource.ts';
import type { IUpdateMutation } from './updateMutation.ts';

export type IOperationName =
  | 'create'
  | 'delete'
  | 'move'
  | 'replicateResource'
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
  | IReplicateResourceMutation<MODEL>,
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

export type IContracts = Record<string, IContract>;

// --- Contracts & validation

export type IContractSpec = {
  readonly commandName: string;
  readonly version: string;
  readonly payloadJsonSchema: JsonSchema.Document<'draft-2020-12'>;
  readonly historicalDefinitions: readonly Readonly<{
    commandName: string;
    version: string;
    payloadJsonSchema: JsonSchema.Document<'draft-2020-12'>;
  }>[];
};

/** Encoded optimistic mutation before worker application adds apply metadata. */
export type IEncodedAggregateFrontendMutation = Readonly<{
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

export type IContract<
  COMMAND_NAME extends string = string,
  PAYLOAD extends IAnyShape = IAnyShape,
  VERSION extends string = string,
  MUTATIONS_SCHEMA extends Schema.Codec<any, any> | null = Schema.Codec<
    any,
    any
  > | null,
  HISTORICAL_DEFINITIONS extends readonly Readonly<{
    commandName: string;
    payload: IAnyShape;
    version: string;
    adaptPayload: (props: { payload: any }) => Effect.Effect<any, IAnyError>;
  }>[] = readonly Readonly<{
    commandName: string;
    payload: IAnyShape;
    version: string;
    adaptPayload: (props: { payload: any }) => Effect.Effect<any, IAnyError>;
  }>[],
> = {
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  historicalDefinitions: HISTORICAL_DEFINITIONS;
  decodeAndAdaptPayload: (props: {
    command: {
      readonly commandName: string;
      readonly contractVersion: string;
      readonly id: string;
      readonly payload: string;
    };
  }) => Effect.Effect<InferCommandPayload<PAYLOAD>, IAnyError>;
  encodePayload: (props: { payload: any }) => Effect.Effect<string, IAnyError>;
  validatePayload: (props: {
    payload: any;
  }) => Effect.Effect<any, IAnyError, CuidFactory>;
  mutations: MUTATIONS_SCHEMA;
  version: VERSION;
  program: InferContractProgram<
    PAYLOAD,
    MUTATIONS_SCHEMA extends Schema.Codec<unknown, unknown>
      ? Schema.Schema.Type<MUTATIONS_SCHEMA>
      : Record<string, never>
  >;
  spec: IContractSpec;
  readonly __mutations?: MUTATIONS_SCHEMA extends Schema.Codec<unknown, unknown>
    ? Schema.Schema.Type<MUTATIONS_SCHEMA>
    : never;
};

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

export type InferCommand<CONTRACT extends IContract> = ISessionCommand<
  ICommand<
    CONTRACT['commandName'],
    CONTRACT['version'],
    InferCommandPayload<CONTRACT['payload']>
  >
> &
  Readonly<{ pushIndex: null }>;

export type IAggregateCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    aggregateId: string;
    aggregateName: string;
    systemName: string;
  }> &
  (
    | Readonly<{
        sessionId: null;
        userId: null;
        frontendName: null;
        pushIndex: null;
      }>
    | Readonly<{
        sessionId: ISessionId;
        userId: string;
        frontendName: string;
        pushIndex: number;
      }>
  );

export type IServiceCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    serviceName: string;
  }>;

export type ISeedCommand = IAggregateCommand | IServiceCommand;

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
