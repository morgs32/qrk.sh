import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IOwnerGuards } from '../contracts/ownerGuards.ts';
import type {
  IAggregateCommand,
  IAnyContracts,
  ICommand,
  IContract,
  IServiceCommand,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyModels,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';

export type IAutomationOutput<CONTRACTS extends IContract = IContract> = {
  readonly contract: CONTRACTS;
  readonly payload: InferPayloadInput<CONTRACTS['payload']>;
};
export type IAutomationContracts<CONTRACTS extends IAnyContracts> = {
  readonly [K in keyof CONTRACTS]: (
    payload: InferPayloadInput<CONTRACTS[K]['payload']>,
  ) => IAutomationOutput<CONTRACTS[K]>;
};
export type IAutomation<
  NAME extends string,
  ON extends IContract,
  CONTRACTS extends IAnyContracts,
  R = never,
> = {
  readonly name: NAME;
  readonly on: ON;
  readonly contracts: CONTRACTS;
  readonly program: (props: {
    db: Readonly<
      Pick<IDb<IResourceDbConfig<ON['models'], Record<never, never>>>, 'query'>
    >;
    on:
      | IAggregateCommand<
          ICommand<
            ON['commandName'],
            ON['version'],
            InferCommandPayload<ON['payload']>
          >
        >
      | IServiceCommand<
          ICommand<
            ON['commandName'],
            ON['version'],
            InferCommandPayload<ON['payload']>
          >
        >;
    contracts: IAutomationContracts<CONTRACTS>;
  }) => Effect.Effect<
    IAutomationOutput<CONTRACTS[keyof CONTRACTS]> | null,
    IAnyError,
    R
  >;
};
// Runtime declarations erase the particular contract types, as actor registries do.
export type IAnyAutomation = {
  readonly name: string;
  readonly on: IContract;
  readonly contracts: IAnyContracts;
  readonly program: (
    // oxlint-disable-next-line typescript/no-explicit-any -- declarations erase callback inputs after factory inference
    props: any,
  ) => Effect.Effect<IAutomationOutput | null, IAnyError, unknown>;
};

type IOutputContract<
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>>,
> = AUTOMATIONS[keyof AUTOMATIONS] extends infer Automation
  ? Automation extends IAnyAutomation
    ? Automation['contracts'][keyof Automation['contracts']]
    : never
  : never;
export type IAutomationOutputContracts<
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>>,
> = {
  readonly [CONTRACTS in IOutputContract<AUTOMATIONS> as CONTRACTS['commandName']]: CONTRACTS;
};

/** Automation-only guards receive selection claims, never a borrowed browser identity. */
export type IActorCommandGuards<
  CONTRACTS extends IAnyContracts,
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>>,
  MODELS extends IAnyModels,
  CLAIMS,
  SELECTION,
  SCOPE extends 'actor' | 'aggregate',
  R = never,
> = {
  readonly [K in keyof (CONTRACTS &
    IAutomationOutputContracts<AUTOMATIONS>)]?: IOwnerGuards<
    CONTRACTS & IAutomationOutputContracts<AUTOMATIONS>,
    MODELS,
    K extends keyof CONTRACTS
      ? K extends keyof IAutomationOutputContracts<AUTOMATIONS>
        ? CLAIMS | SELECTION
        : CLAIMS
      : SELECTION,
    SCOPE,
    R
  >[K];
};
