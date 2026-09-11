import type { IAnyError } from '@zerospin/error';
import { type Effect, type Layer, type Schema, type Scope } from 'effect';

import type { IAuthentication } from '../authentication/types.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyServiceFrontendBinding,
  IServiceAuthorization,
} from '../frontendBinding/types.ts';
import type { IAnyModels } from '../models/types.ts';

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
  AUTHENTICATION extends IAuthentication = IAuthentication,
> = {
  /** Type-only requirements retained when system registries erase concrete guards and layers. */
  readonly __initializeRequirements?:
    | LAYER_REQUIREMENTS
    | Exclude<GUARD_REQUIREMENTS, LAYER_SERVICES>
    | Scope.Scope;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly authentication: AUTHENTICATION;
  readonly name: NAME;
  readonly version: VERSION;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly queries: Readonly<QUERIES>;
  readonly frontends: Readonly<FRONTENDS>;
} & ([keyof FRONTENDS] extends [never]
  ? { readonly authorize?: never }
  : { readonly authorize: AUTHORIZE });

export type IAnyService<
  GUARD_REQUIREMENTS = unknown,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = unknown,
  INITIALIZE_REQUIREMENTS = unknown,
> = {
  /** Type-only requirements retained when system registries erase concrete guards and layers. */
  readonly __initializeRequirements?: INITIALIZE_REQUIREMENTS | Scope.Scope;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly authentication: IAuthentication;
  readonly name: string;
  readonly version: string;
  readonly models: IAnyModels;
  readonly contracts: IAnyContracts<GUARD_REQUIREMENTS>;
  readonly queries: Readonly<Record<string, IAnyServiceQuery>>;
  readonly frontends: Readonly<Record<string, IAnyServiceFrontendBinding>>;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, never>;
  }['bivarianceHack'];
};

export type IAnyServices<GUARD_REQUIREMENTS = unknown> = Readonly<
  Record<string, IAnyService<GUARD_REQUIREMENTS>>
>;
