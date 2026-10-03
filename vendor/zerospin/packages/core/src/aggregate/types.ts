import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';
import type { IAnyOwnerGuard, IOwnerGuards } from '../contracts/ownerGuards.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IAnyModels } from '../models/types.ts';

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
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
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
  readonly models: IAnyModels;
  readonly contracts: IAnyContracts;
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
  CONTRACTS extends IAnyContracts = IAnyContracts,
> = IAuthoredAggregate<
  NAME,
  MODELS,
  ACTORS,
  VERSION,
  GUARD_REQUIREMENTS,
  CONTRACTS
>;
export type IAnyAggregate = IAnyAuthoredAggregate;
/** All declared versions of one aggregate owner. */
export type IAggregateRegistry = Readonly<Record<string, IAnyAggregate>>;
