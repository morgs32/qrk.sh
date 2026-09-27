import type { IAnyError } from '@zerospin/error';
import { type Effect, type Schema } from 'effect';

import type { IAnyAutomation } from '../automation/types.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IAnyModels } from '../models/types.ts';
import type { IAnyDeclarationModule } from '../module/types.ts';
import type { IAnyServiceActorVersion } from '../serviceActor/types.ts';

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
  ACTORS extends Record<string, IAnyServiceActorVersion> = Record<
    string,
    IAnyServiceActorVersion
  >,
  VERSION extends string = string,
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = Readonly<
    Record<string, IAnyAutomation>
  >,
> = {
  readonly actors: Readonly<ACTORS>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly automations: Readonly<AUTOMATIONS>;
  readonly queries: Readonly<QUERIES>;
};

export type IAnyService = {
  readonly actors: Readonly<Record<string, IAnyServiceActorVersion>>;
  readonly name: string;
  readonly version: string;
  readonly models: IAnyModels;
  readonly contracts: IAnyContracts;
  readonly automations: Readonly<Record<string, IAnyAutomation>>;
  readonly queries: Readonly<Record<string, IAnyServiceQuery>>;
};

export type IAnyServices = Readonly<Record<string, IAnyService>>;

export type IVersionedService<
  NAME extends string = string,
  MODULES extends Readonly<Record<string, IAnyDeclarationModule>> = Readonly<
    Record<string, IAnyDeclarationModule>
  >,
  ACTORS extends Partial<
    Record<
      keyof MODULES & string,
      Readonly<Record<string, IAnyServiceActorVersion>>
    >
  > = {},
> = {
  readonly name: NAME;
  readonly versions: {
    readonly [VERSION in keyof MODULES & string]: IService<
      NAME,
      MODULES[VERSION]['models'],
      MODULES[VERSION]['contracts'],
      Record<string, IAnyServiceQuery>,
      VERSION extends keyof ACTORS ? NonNullable<ACTORS[VERSION]> : {},
      VERSION,
      MODULES[VERSION]['automations']
    >;
  };
};

export type IAnyVersionedService = {
  readonly name: string;
  readonly versions: Readonly<Record<string, IAnyService>>;
};
