import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { type Effect, type Layer, type Schema, type Scope } from 'effect';

import type {
  IAnyContracts,
  ICommand,
  IServiceCommand,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyServiceFrontendBinding,
  IServiceAuthorization,
} from '../frontendBinding/types.ts';
import type { initializeGuards } from '../guards/initializeGuards.ts';
import type {
  IAnyModels,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';

export type IServiceQuery<
  MODELS extends IAnyModels = IAnyModels,
  PARAMS_SCHEMA extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  RESULT = unknown,
> = {
  paramsSchema: PARAMS_SCHEMA;
  query: {
    bivarianceHack(props: {
      db: Readonly<
        Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
      >;
      params: Schema.Schema.Type<PARAMS_SCHEMA>;
    }): Effect.Effect<RESULT, IAnyError>;
  }['bivarianceHack'];
};

export type IResolvedServiceQuery<
  SERVICE_NAME extends string = string,
  QUERY_NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  PARAMS_SCHEMA extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  RESULT = unknown,
> = Readonly<IServiceQuery<MODELS, PARAMS_SCHEMA, RESULT>> & {
  readonly kind: 'service';
  readonly name: QUERY_NAME;
  readonly serviceName: SERVICE_NAME;
};

export type IAnyServiceQuery = {
  readonly kind: 'service';
  readonly name: string;
  readonly serviceName: string;
  readonly paramsSchema: Schema.Codec<unknown, unknown>;
  readonly query: {
    bivarianceHack(props: {
      db: Readonly<Pick<IDb, 'query'>>;
      params: unknown;
    }): Effect.Effect<unknown, IAnyError>;
  }['bivarianceHack'];
};

export type IService<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  CONTRACTS extends IAnyContracts = IAnyContracts,
  QUERIES extends Record<string, IAnyServiceQuery> = Record<
    string,
    IAnyServiceQuery
  >,
  FRONTENDS extends Record<string, IAnyServiceFrontendBinding> = Record<
    string,
    IAnyServiceFrontendBinding
  >,
  AUTHORIZE extends IServiceAuthorization<FRONTENDS, MODELS, never> =
    IServiceAuthorization<FRONTENDS, MODELS, never>,
  VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = unknown,
  GUARD_REQUIREMENTS = Effect.Services<
    ReturnType<NonNullable<CONTRACTS[keyof CONTRACTS]['guard']>>
  >,
> = {
  readonly initializeGuards: ReturnType<
    typeof initializeGuards<
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      GUARD_REQUIREMENTS
    >
  >;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly historicalDefinitions: readonly Readonly<{
    readonly version: string;
    readonly models: Readonly<Record<string, string>>;
    readonly contracts: Readonly<Record<string, string>>;
  }>[];
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly queries: Readonly<QUERIES>;
  readonly frontends: Readonly<FRONTENDS>;
  readonly getVersion: (
    snapshotVersion: string,
  ) => IAnyService<
    GUARD_REQUIREMENTS,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS,
    LAYER_REQUIREMENTS | Exclude<GUARD_REQUIREMENTS, LAYER_SERVICES>
  >;
  readonly makeCommand: <
    CONTRACT_NAME extends keyof CONTRACTS & string,
  >(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
  }) => Effect.Effect<
    IServiceCommand<
      ICommand<
        CONTRACTS[CONTRACT_NAME]['commandName'],
        CONTRACTS[CONTRACT_NAME]['version'],
        InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
      >,
      NAME
    >,
    IAnyError,
    CuidFactory
  >;
} & ([keyof FRONTENDS] extends [never]
  ? { readonly authorize?: never }
  : { readonly authorize: AUTHORIZE });

export type IAnyService<
  GUARD_REQUIREMENTS = unknown,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = unknown,
  INITIALIZE_REQUIREMENTS = unknown,
> = {
  readonly initializeGuards: Effect.Effect<
    Effect.Success<
      ReturnType<typeof initializeGuards<never, unknown, unknown>>
    >,
    IAnyError,
    INITIALIZE_REQUIREMENTS | Scope.Scope
  >;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly name: string;
  readonly version: string;
  readonly historicalDefinitions: readonly Readonly<{
    readonly version: string;
    readonly models: Readonly<Record<string, string>>;
    readonly contracts: Readonly<Record<string, string>>;
  }>[];
  readonly models: IAnyModels;
  readonly contracts: IAnyContracts<GUARD_REQUIREMENTS>;
  readonly queries: Readonly<Record<string, IAnyServiceQuery>>;
  readonly frontends: Readonly<Record<string, IAnyServiceFrontendBinding>>;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, never>;
  }['bivarianceHack'];
  readonly getVersion: (
    snapshotVersion: string,
  ) => IAnyService<
    GUARD_REQUIREMENTS,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS,
    INITIALIZE_REQUIREMENTS
  >;
  readonly makeCommand: (
    props: never,
  ) => Effect.Effect<unknown, IAnyError, CuidFactory>;
};

export type IAnyServices<GUARD_REQUIREMENTS = unknown> = Readonly<
  Record<string, IAnyService<GUARD_REQUIREMENTS>>
>;
