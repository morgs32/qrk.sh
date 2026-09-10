import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { type Effect, type Layer, type Scope } from 'effect';

import type {
  IAggregateCommand,
  IAnyContractBindings,
  ICommand,
  IContractBinding,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { initializeGuards } from '../guards/initializeGuards.ts';
import type { ISelectionWhereProps } from '../models/makeSelection.ts';
import type {
  IAggregateId,
  IAnyModels,
  IModel,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';

export type IAggregateAuthorization<
  MODELS extends IAnyModels,
  AUTHORIZATION_CONTEXT = never,
> = (props: {
  userId: string;
  aggregateId: IAggregateId;
  db: Readonly<
    Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
  >;
}) => Effect.Effect<void, IAnyError, AUTHORIZATION_CONTEXT>;

type IAnySelection = {
  readonly model: IModel;
  readonly where: {
    bivarianceHack(props: ISelectionWhereProps): Record<string, unknown>;
  }['bivarianceHack'];
};

export type IAuthoredAggregate<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  CONTRACTS extends IAnyContractBindings = IAnyContractBindings,
  SELECTIONS extends Record<string, IAnySelection> = Record<
    string,
    IAnySelection
  >,
  AUTHORIZE extends IAggregateAuthorization<MODELS> =
    IAggregateAuthorization<MODELS>,
  VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
> = {
  readonly initializeGuards: ReturnType<
    typeof initializeGuards<
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      | Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >
      | {
          [K in keyof CONTRACTS]: CONTRACTS[K] extends {
            readonly guard: (
              ...args: never[]
            ) => Effect.Effect<void, IAnyError, infer R>;
          }
            ? R
            : never;
        }[keyof CONTRACTS]
    >
  >;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly services: Readonly<Record<string, string>>;
  readonly models: Readonly<MODELS>;
  readonly contracts: {
    readonly [COMMAND_NAME in keyof CONTRACTS]: IContractBinding<
      CONTRACTS[COMMAND_NAME]['contract'],
      CONTRACTS[COMMAND_NAME] extends {
        readonly guard: infer GUARD extends NonNullable<
          IContractBinding['guard']
        >;
      }
        ? GUARD
        : never
    >;
  };
  readonly selections: {
    readonly [SELECTION_NAME in keyof SELECTIONS]: Readonly<
      SELECTIONS[SELECTION_NAME]
    >;
  };
  readonly getVersion: (snapshotVersion: string) => Effect.Effect<
    IAnyAuthoredAggregate<
      | Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >
      | {
          [K in keyof CONTRACTS]: CONTRACTS[K] extends {
            readonly guard: (
              ...args: never[]
            ) => Effect.Effect<void, IAnyError, infer R>;
          }
            ? R
            : never;
        }[keyof CONTRACTS],
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      | LAYER_REQUIREMENTS
      | Exclude<
          | Effect.Services<
              ReturnType<
                NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
              >
            >
          | {
              [K in keyof CONTRACTS]: CONTRACTS[K] extends {
                readonly guard: (
                  ...args: never[]
                ) => Effect.Effect<void, IAnyError, infer R>;
              }
                ? R
                : never;
            }[keyof CONTRACTS],
          LAYER_SERVICES
        >
    >,
    IAnyError
  >;
  readonly makeCommand: <
    CONTRACT_NAME extends keyof CONTRACTS & string,
    const SYSTEM_NAME extends string,
  >(props: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: SYSTEM_NAME;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['contract']['payload']>;
  }) => Effect.Effect<
    Extract<
      IAggregateCommand<
        ICommand<
          CONTRACTS[CONTRACT_NAME]['contract']['commandName'],
          CONTRACTS[CONTRACT_NAME]['contract']['version'],
          InferCommandPayload<CONTRACTS[CONTRACT_NAME]['contract']['payload']>
        >,
        NAME,
        SYSTEM_NAME
      >,
      { sessionId: null }
    >,
    IAnyError,
    CuidFactory
  >;
  readonly authorize?: AUTHORIZE;
};

export type IAnyAuthoredAggregate<
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
  readonly services: Readonly<Record<string, string>>;
  readonly models: IAnyModels;
  readonly contracts: IAnyContractBindings<GUARD_REQUIREMENTS>;
  readonly selections: Readonly<Record<string, IAnySelection>>;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError>;
  }['bivarianceHack'];
  readonly getVersion: (
    snapshotVersion: string,
  ) => Effect.Effect<
    IAnyAuthoredAggregate<
      GUARD_REQUIREMENTS,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      INITIALIZE_REQUIREMENTS
    >,
    IAnyError
  >;
  readonly makeCommand: (
    props: never,
  ) => Effect.Effect<unknown, IAnyError, CuidFactory>;
};

export type IAggregate<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  CONTRACTS extends IAnyContractBindings = IAnyContractBindings,
  SELECTIONS extends Record<string, IAnySelection> = Record<
    string,
    IAnySelection
  >,
  AUTHORIZE extends IAggregateAuthorization<MODELS> =
    IAggregateAuthorization<MODELS>,
  VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
> = {
  readonly initializeGuards: ReturnType<
    typeof initializeGuards<
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      | Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >
      | {
          [K in keyof CONTRACTS]: CONTRACTS[K] extends {
            readonly guard: (
              ...args: never[]
            ) => Effect.Effect<void, IAnyError, infer R>;
          }
            ? R
            : never;
        }[keyof CONTRACTS]
    >
  >;
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly services: Readonly<Record<string, string>>;
  readonly models: Readonly<MODELS>;
  readonly contracts: {
    readonly [COMMAND_NAME in keyof CONTRACTS]: IContractBinding<
      CONTRACTS[COMMAND_NAME]['contract'],
      CONTRACTS[COMMAND_NAME] extends {
        readonly guard: infer GUARD extends NonNullable<
          IContractBinding['guard']
        >;
      }
        ? GUARD
        : never
    >;
  };
  readonly selections: {
    readonly [SELECTION_NAME in keyof SELECTIONS]: Readonly<
      SELECTIONS[SELECTION_NAME]
    >;
  };
  readonly getVersion: (snapshotVersion: string) => Effect.Effect<
    IAnyAggregate<
      | Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >
      | {
          [K in keyof CONTRACTS]: CONTRACTS[K] extends {
            readonly guard: (
              ...args: never[]
            ) => Effect.Effect<void, IAnyError, infer R>;
          }
            ? R
            : never;
        }[keyof CONTRACTS],
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      | LAYER_REQUIREMENTS
      | Exclude<
          | Effect.Services<
              ReturnType<
                NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
              >
            >
          | {
              [K in keyof CONTRACTS]: CONTRACTS[K] extends {
                readonly guard: (
                  ...args: never[]
                ) => Effect.Effect<void, IAnyError, infer R>;
              }
                ? R
                : never;
            }[keyof CONTRACTS],
          LAYER_SERVICES
        >
    >,
    IAnyError
  >;
  readonly makeCommand: <
    CONTRACT_NAME extends keyof CONTRACTS & string,
    const SYSTEM_NAME extends string,
  >(props: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: SYSTEM_NAME;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['contract']['payload']>;
  }) => Effect.Effect<
    Extract<
      IAggregateCommand<
        ICommand<
          CONTRACTS[CONTRACT_NAME]['contract']['commandName'],
          CONTRACTS[CONTRACT_NAME]['contract']['version'],
          InferCommandPayload<CONTRACTS[CONTRACT_NAME]['contract']['payload']>
        >,
        NAME,
        SYSTEM_NAME
      >,
      { sessionId: null }
    >,
    IAnyError,
    CuidFactory
  >;
  readonly authorize?: AUTHORIZE;
};

export type IAnyAggregate<
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
  readonly services: Readonly<Record<string, string>>;
  readonly models: IAnyModels;
  readonly contracts: IAnyContractBindings<GUARD_REQUIREMENTS>;
  readonly selections: Readonly<Record<string, IAnySelection>>;
  readonly authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError>;
  }['bivarianceHack'];
  readonly getVersion: (
    snapshotVersion: string,
  ) => Effect.Effect<
    IAnyAggregate<
      GUARD_REQUIREMENTS,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      INITIALIZE_REQUIREMENTS
    >,
    IAnyError
  >;
  readonly makeCommand: (
    props: never,
  ) => Effect.Effect<unknown, IAnyError, CuidFactory>;
};

export type IAnyAggregates = Readonly<Record<string, IAnyAggregate>>;
