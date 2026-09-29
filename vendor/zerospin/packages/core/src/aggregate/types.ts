import type { IFrameworkError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';
import type { IAnyOwnerGuard, IOwnerGuards } from '../contracts/ownerGuards.ts';
import type {
  IAnyContracts,
  IAnyMutation,
  IModelMutations,
  InferFailure,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IAnyModels, InferCommandPayload } from '../models/types.ts';

export type IAggregateExtensions<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
> = {
  readonly [K in keyof CONTRACTS]?: (props: {
    db: string extends keyof MODELS
      ? Readonly<Pick<IDb, 'query'>>
      : Readonly<
          Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
        >;
    models: { readonly [M in keyof MODELS]: IModelMutations<MODELS[M]> };
    payload: InferCommandPayload<CONTRACTS[K]['payload']>;
    failures: CONTRACTS[K]['failures'];
  }) => Effect.Effect<
    readonly IAnyMutation[],
    | IFrameworkError
    | Extract<InferFailure<CONTRACTS[K]>, { readonly scope: 'aggregate' }>,
    unknown
  >;
};

export type IAnyAggregateExtension = {
  bivarianceHack(
    // oxlint-disable-next-line typescript/no-explicit-any -- authored callbacks are checked before registry erasure
    props: any,
  ): Effect.Effect<readonly IAnyMutation[], unknown, unknown>;
}['bivarianceHack'];

export type IAuthoredAggregate<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  ACTORS extends Record<string, IAnyAggregateActorVersion> = Record<
    string,
    IAnyAggregateActorVersion
  >,
  VERSION extends string = string,
  GUARD_REQUIREMENTS = never,
  CONTRACTS extends IAnyContracts = IAnyContracts,
> = {
  readonly __guardRequirements?: GUARD_REQUIREMENTS;
  readonly name: NAME;
  readonly version: VERSION;
  readonly services: Readonly<Record<string, string>>;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly extensions: IAggregateExtensions<CONTRACTS, MODELS>;
  readonly actors: Readonly<ACTORS>;
  readonly guards: {
    readonly [K in keyof ACTORS]?: IOwnerGuards<
      ACTORS[K]['contracts'],
      MODELS,
      ACTORS[K]['identity']['claimsSchema']['Type'],
      'aggregate',
      GUARD_REQUIREMENTS
    >;
  };
};

export type IAnyAuthoredAggregate = {
  readonly __guardRequirements?: unknown;
  readonly name: string;
  readonly version: string;
  readonly services: Readonly<Record<string, string>>;
  readonly models: IAnyModels;
  readonly contracts: IAnyContracts;
  readonly extensions: Readonly<
    Record<string, IAnyAggregateExtension | undefined>
  >;
  readonly actors: Readonly<Record<string, IAnyAggregateActorVersion>>;
  readonly guards: Readonly<
    Record<
      string,
      Readonly<Record<string, IAnyOwnerGuard | undefined>> | undefined
    >
  >;
};

export type IAggregate<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  ACTORS extends Record<string, IAnyAggregateActorVersion> = Record<
    string,
    IAnyAggregateActorVersion
  >,
  VERSION extends string = string,
  GUARD_REQUIREMENTS = never,
> = IAuthoredAggregate<NAME, MODELS, ACTORS, VERSION, GUARD_REQUIREMENTS>;
export type IAnyAggregate = IAnyAuthoredAggregate;
export type IAnyAggregates = Readonly<Record<string, IAnyAggregate>>;
