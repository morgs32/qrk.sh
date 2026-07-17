/* oxlint-disable typescript/no-explicit-any -- payload/mutation erased defaults */
import type { IAnyError } from '@zerospin/error';
import type { Effect, JSONSchema, Schema } from 'effect';
import { type BrandTypeId } from 'effect/Brand';

import type {
  IAccountCursor,
  IAnyShape,
  IModel,
  InferCommandPayload,
  InferDecodedRow,
  InferIdFromAbbreviation,
  InferResource,
  IPushedCursorId,
  IServiceCursorId,
  IStagedCursorId,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

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

/** Serializable contract metadata and payload JSON Schema for deploy specs and RPC. */
type ICommandFinalizationMode = 'authoritative' | 'optimistic-lww';

export type IContractSpec = {
  readonly commandName: string;
  readonly version: string;
  readonly payloadJsonSchema: JSONSchema.JsonSchema7Root;
};

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
  MUTATIONS_SCHEMA extends
    | Schema.Schema.AnyNoContext
    | null = Schema.Schema.AnyNoContext | null,
> = {
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  decodePayload: {
    [BrandTypeId]: 'decodePayload';
  } & ((props: {
    command: {
      readonly commandName: string;
      readonly id: string;
      readonly payload: string;
    };
  }) => Effect.Effect<any, IAnyError>);
  encodePayload: {
    [BrandTypeId]: 'encodePayload';
  } & ((props: { payload: any }) => Effect.Effect<string, IAnyError>);
  validatePayload: {
    [BrandTypeId]: 'validatePayload';
  } & ((props: { payload: any }) => Effect.Effect<any, IAnyError, CuidFactory>);
  mutations: MUTATIONS_SCHEMA;
  version: VERSION;
  program: InferContractProgram<
    PAYLOAD,
    MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext
      ? Schema.Schema.Type<MUTATIONS_SCHEMA>
      : Record<string, never>
  >;
  spec: IContractSpec;
  readonly __mutations?: MUTATIONS_SCHEMA extends Schema.Schema.AnyNoContext
    ? Schema.Schema.Type<MUTATIONS_SCHEMA>
    : never;
};

// --- Command pipeline types

export type ICommand<
  COMMAND_NAME extends string = string,
  VERSION extends string = string,
  PAYLOAD = unknown,
> = Readonly<{
  id: InferIdFromAbbreviation<'cmd'>;
  commandName: COMMAND_NAME;
  payload: PAYLOAD;
  version: VERSION;
}>;

export type ISessionId = InferIdFromAbbreviation<'sesn'>;

/** Encode payload to string immediately before persisting a command row. */
export type IEncodedCommand<COMMAND extends ICommand> = Omit<
  COMMAND,
  'payload'
> &
  Readonly<{
    payload: string;
  }>;

export type InferCommand<CONTRACT extends IContract> = ISessionCommand<
  ICommand<
    CONTRACT['commandName'],
    CONTRACT['version'],
    InferCommandPayload<CONTRACT['payload']>
  >
>;

export type IAccountCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    commandType: 'account';
    accountId: string;
    accountName: string;
    systemName: string;
    systemVersion: string;
    sessionId: ISessionId | null;
    actorId: string | null;
    actorName: string | null;
    frontendName: string | null;
    pushedCursor: IPushedCursorId | null;
  }>;

export type IServiceCommand<COMMAND extends ICommand = ICommand> = COMMAND &
  Readonly<{
    commandType: 'service';
    serviceName: string;
    systemVersion: string;
  }>;

export type IDeploySeedCommand = IAccountCommand | IServiceCommand;

export type IActorCommand<COMMAND extends ICommand = ICommand> = Omit<
  IAccountCommand<COMMAND>,
  'commandType'
> &
  Readonly<{
    commandType: 'actor';
    actorId: string;
    actorName: string;
    frontendName: string;
  }>;

export type ISessionCommand<COMMAND extends ICommand = ICommand> = Omit<
  IActorCommand<COMMAND>,
  'commandType'
> &
  Readonly<{
    sessionId: ISessionId;
  }>;

export type IExecutedAccountCommand<COMMAND extends ICommand = ICommand> =
  IAccountCommand<COMMAND> &
    Readonly<{
      mode: ICommandFinalizationMode;
      accountCursor: IAccountCursor;
      accountIndex: number;
      executedAt: Date;
      status: 'executed';
    }>;

export type IExecutedServiceCommand<COMMAND extends ICommand = ICommand> =
  IServiceCommand<COMMAND> &
    Readonly<{
      mode: ICommandFinalizationMode;
      serviceCursor: IServiceCursorId;
      serviceIndex: number;
      executedAt: Date;
      status: 'executed';
    }>;

export type IFailedAccountCommand<COMMAND extends ICommand = ICommand> =
  IAccountCommand<COMMAND> &
    Readonly<{
      accountCursor: IAccountCursor;
      accountIndex: number;
      failedAt: Date;
      failure: string;
      status: 'failed';
    }>;

export type IFailedServiceCommand<COMMAND extends ICommand = ICommand> =
  IServiceCommand<COMMAND> &
    Readonly<{
      serviceCursor: IServiceCursorId;
      serviceIndex: number;
      failedAt: Date;
      failure: string;
      status: 'failed';
    }>;

export type IUnstagedCommand<COMMAND extends ICommand = ICommand> =
  ISessionCommand<COMMAND> &
    Readonly<{
      commandType: 'frontend';
      accountId: string;
      accountName: string;
      frontendName: string;
      actorId: string;
      actorName: string;
      sessionId: ISessionId;
      stagedCursor: null;
      stagedAt: null;
      status: null;
    }>;

export type IStagedCommand<COMMAND extends ICommand = ICommand> =
  ISessionCommand<COMMAND> &
    Readonly<{
      commandType: 'frontend';
      stagedCursor: IStagedCursorId;
      stagedAt: Date;
      status: 'staged';
    }>;

export type IFailedStagedCommand<COMMAND extends ICommand = ICommand> = Omit<
  IStagedCommand<COMMAND>,
  'status'
> &
  Readonly<{
    failedAt: Date;
    failure: string;
    status: 'failed';
  }>;

export type IPushedCommand<COMMAND extends ICommand = ICommand> = Omit<
  IStagedCommand<COMMAND>,
  'status'
> &
  Readonly<{
    pushedAt: Date;
    pushedCursor: IPushedCursorId;
    status: 'pushed';
  }>;

export type IPushedBlock = Readonly<{
  id: InferIdFromAbbreviation<'pblk'>;
  sessionId: ISessionId;
  admissionLastAccountCursor: IAccountCursor | null;
  commands: readonly IEncodedCommand<IPushedCommand>[];
}>;

export type IExecutedPushedCommand<COMMAND extends ICommand = ICommand> = Omit<
  IPushedCommand<COMMAND>,
  'status'
> &
  Readonly<{
    mode: ICommandFinalizationMode;
    accountCursor: IAccountCursor;
    accountIndex: number;
    executedAt: Date;
    status: 'executed';
  }>;

export type IFailedPushedCommand<COMMAND extends ICommand = ICommand> = Omit<
  IPushedCommand<COMMAND>,
  'status'
> &
  Readonly<{
    accountCursor: IAccountCursor;
    accountIndex: number;
    failedAt: Date;
    failure: string;
    status: 'failed';
  }>;
