import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';
import type {
  IActorCommandGuards,
  IAnyAutomation,
} from '../automation/types.ts';
import type { IAnyOwnerGuard } from '../contracts/ownerGuards.ts';
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
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = Readonly<
    Record<string, IAnyAutomation>
  >,
> = {
  readonly __guardRequirements?: GUARD_REQUIREMENTS;
  readonly name: NAME;
  readonly version: VERSION;
  readonly services: Readonly<Record<string, string>>;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly automations: Readonly<AUTOMATIONS>;
  readonly actors: Readonly<ACTORS>;
  readonly guards: {
    readonly [K in keyof ACTORS]?: IActorCommandGuards<
      ACTORS[K]['contracts'],
      ACTORS[K]['automations'],
      MODELS,
      ACTORS[K]['identity']['identitySchema']['Type'],
      ACTORS[K]['identity']['actorSchema']['Type'],
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
  readonly automations: Readonly<Record<string, IAnyAutomation>>;
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
