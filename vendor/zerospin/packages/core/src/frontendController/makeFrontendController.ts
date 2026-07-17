import type { IAnyError } from '@zerospin/error';
import { type Effect, type Schema } from 'effect';

import type { AssertContractsMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import type { IContracts } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { makeGuards } from '../guards/makeGuards.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IActorId,
  IAssertValidModels,
  IModels,
  InferCommandPayload,
} from '../models/types.ts';
import { makeUnstagedCommand } from '../session/makeUnstagedCommand.ts';
import type { ITypeError } from '../utils/types.ts';

import type { IFrontendController } from './types.ts';

export function makeFrontendController<
  SYSTEM_NAME extends string,
  CONTRACTS extends IContracts,
  FRONTEND_NAME extends string,
  VERSION extends string,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
>(props: {
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, {}> & {
      [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
        ? CONTRACTS[K]
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
  accountName: string;
  actorName: FRONTEND_NAME;
  frontendName: string;
  version: VERSION;
  systemName: SYSTEM_NAME;
  models?: undefined;
  signature: SIGNATURE_SCHEMA;
  guards?: {
    [K in keyof CONTRACTS & string]?: ReadonlyArray<
      (props: {
        actorId: IActorId;
        db: IDb<IResourceDbConfig<{}>>;
        payload: InferCommandPayload<CONTRACTS[K]['payload']>;
      }) => Effect.Effect<void, IAnyError>
    >;
  };
}): IFrontendController<
  SYSTEM_NAME,
  FRONTEND_NAME,
  CONTRACTS,
  {},
  SIGNATURE_SCHEMA,
  VERSION
>;
export function makeFrontendController<
  SYSTEM_NAME extends string,
  CONTRACTS extends IContracts,
  FRONTEND_NAME extends string,
  MODELS extends IModels,
  VERSION extends string,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
  GUARDS extends {
    [K in keyof CONTRACTS & string]?: ReadonlyArray<
      (props: {
        actorId: IActorId;
        db: IDb<IResourceDbConfig<MODELS>>;
        payload: InferCommandPayload<CONTRACTS[K]['payload']>;
      }) => Effect.Effect<void, IAnyError>
    >;
  } = {},
>(props: {
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS> & {
      [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
        ? CONTRACTS[K]
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
  accountName: string;
  actorName: FRONTEND_NAME;
  frontendName: string;
  version: VERSION;
  systemName: SYSTEM_NAME;
  models: MODELS & IAssertValidModels<MODELS>;
  signature: SIGNATURE_SCHEMA;
  guards?: GUARDS & {
    [K in keyof GUARDS & string]: K extends keyof CONTRACTS & string
      ? GUARDS[K]
      : ITypeError<`Bad guard "${K}". Keys in guards must be contract command names`>;
  };
}): IFrontendController<
  SYSTEM_NAME,
  FRONTEND_NAME,
  CONTRACTS,
  MODELS,
  SIGNATURE_SCHEMA,
  VERSION
>;
export function makeFrontendController<
  SYSTEM_NAME extends string,
  CONTRACTS extends IContracts,
  FRONTEND_NAME extends string,
  MODELS extends IModels,
  VERSION extends string,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
  GUARDS extends {
    [K in keyof CONTRACTS & string]?: ReadonlyArray<
      (props: {
        actorId: IActorId;
        db: IDb<IResourceDbConfig<MODELS>>;
        payload: InferCommandPayload<CONTRACTS[K]['payload']>;
      }) => Effect.Effect<void, IAnyError>
    >;
  } = {},
>(props: {
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS> & {
      [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
        ? CONTRACTS[K]
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
  accountName: string;
  actorName: FRONTEND_NAME;
  frontendName: string;
  version: VERSION;
  systemName: SYSTEM_NAME;
  models?: MODELS & IAssertValidModels<MODELS>;
  signature: SIGNATURE_SCHEMA;
  guards?: GUARDS & {
    [K in keyof GUARDS & string]: K extends keyof CONTRACTS & string
      ? GUARDS[K]
      : ITypeError<`Bad guard "${K}". Keys in guards must be contract command names`>;
  };
}): IFrontendController<
  SYSTEM_NAME,
  FRONTEND_NAME,
  CONTRACTS,
  MODELS | {},
  SIGNATURE_SCHEMA,
  VERSION
> {
  const {
    contracts,
    accountName,
    actorName,
    frontendName,
    version,
    systemName,
    models = {},
    signature,
    guards: guardsInput = {},
  } = props;

  assertValidModels({ models, context: 'makeFrontendController' });

  const guards = makeGuards({
    contracts,
    guards: guardsInput,
  });

  const makeFrontendUnstagedCommand: IFrontendController<
    SYSTEM_NAME,
    FRONTEND_NAME,
    CONTRACTS,
    MODELS | {},
    SIGNATURE_SCHEMA,
    VERSION
  >['makeUnstagedCommand'] = props =>
    makeUnstagedCommand({
      contracts,
      systemName,
      accountName,
      actorName,
      frontendName,
      ...props,
    });

  return {
    contracts,
    accountName,
    actorName,
    frontendName,
    version,
    systemName,
    modelNames: Object.keys(models),
    models,
    signature,
    guards,
    makeUnstagedCommand: makeFrontendUnstagedCommand,
  };
}
