import type { IAnyError } from '@zerospin/error';
import type { IEncodedShape } from '@zerospin/schema';
import { type Effect, type Layer, type Scope } from 'effect';

import type {
  IAnyContractBindings,
  IAnyContracts,
} from '../contracts/types.ts';
import type { initializeGuards } from '../guards/initializeGuards.ts';
import type { IAnyModels, IModelSpec } from '../models/types.ts';

export type IAggregateFrontendController<
  SYSTEM_NAME extends string = string,
  AGGREGATE_NAME extends string = string,
  FRONTEND_NAME extends string = string,
  CONTRACTS extends IAnyContractBindings = IAnyContractBindings,
  MODELS extends IAnyModels = IAnyModels,
  AGGREGATE_VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = unknown,
> = Readonly<{
  readonly initializeGuards: ReturnType<
    typeof initializeGuards<
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      Effect.Services<
        ReturnType<NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>>
      >
    >
  >;
  layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  kind: 'aggregate';
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  name: FRONTEND_NAME;
  contracts: {
    readonly [COMMAND_NAME in keyof CONTRACTS]: Readonly<{
      contract: CONTRACTS[COMMAND_NAME]['contract'];
    }>;
  };
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;

export type IServiceFrontendController<
  SYSTEM_NAME extends string = string,
  SERVICE_NAME extends string = string,
  FRONTEND_NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  SERVICE_VERSION extends string = string,
> = Readonly<{
  kind: 'service';
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  name: FRONTEND_NAME;
  contracts: Readonly<Record<never, never>>;
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;

export type IAnyAggregateFrontendController<
  GUARD_REQUIREMENTS = unknown,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = unknown,
  INITIALIZE_REQUIREMENTS = unknown,
> = Readonly<{
  readonly initializeGuards: Effect.Effect<
    Effect.Success<
      ReturnType<typeof initializeGuards<never, unknown, unknown>>
    >,
    IAnyError,
    INITIALIZE_REQUIREMENTS | Scope.Scope
  >;
  layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  kind: 'aggregate';
  systemName: string;
  aggregateName: string;
  aggregateVersion: string;
  name: string;
  contracts: Readonly<
    Record<
      string,
      Readonly<{ contract: IAnyContracts<GUARD_REQUIREMENTS>[string] }>
    >
  >;
  models: Readonly<IAnyModels>;
  modelNames: readonly string[];
}>;

export type IAnyServiceFrontendController = Readonly<{
  kind: 'service';
  systemName: string;
  serviceName: string;
  serviceVersion: string;
  name: string;
  contracts: Readonly<Record<never, never>>;
  models: Readonly<IAnyModels>;
  modelNames: readonly string[];
}>;

export type IAnyFrontendController<INITIALIZE_REQUIREMENTS = unknown> =
  | IAnyAggregateFrontendController<
      unknown,
      never,
      unknown,
      INITIALIZE_REQUIREMENTS
    >
  | IAnyServiceFrontendController;

export type InferFrontendModels<FRONTEND extends IAnyFrontendController> =
  FRONTEND['models'];

export type IFrontendControllerSpec = Readonly<{
  systemName: string;
  name: string;
  modelNames: readonly string[];
  models: Readonly<
    Record<
      string,
      Readonly<{
        modelName: string;
        abbreviation: string;
        version: string;
        properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
        indexes: readonly Readonly<{
          name: string;
          columns: readonly string[];
          unique?: boolean;
        }>[];
      }>
    >
  >;
  contracts: Readonly<
    Record<
      string,
      Readonly<{
        commandName: string;
        version: string;
        payloadShape: Readonly<IEncodedShape>;
        models: Readonly<Record<string, IModelSpec>>;
      }>
    >
  >;
}> &
  (
    | Readonly<{
        kind: 'aggregate';
        aggregateName: string;
        aggregateVersion: string;
        serviceName?: never;
        aggregateFrontendLock: Readonly<{
          systemName: string;
          frontendName: string;
          models: Readonly<
            Record<
              string,
              Readonly<{
                modelName: string;
                abbreviation: string;
                version: string;
                propertiesShape: Readonly<IEncodedShape>;
                indexes: readonly Readonly<{
                  name: string;
                  columns: readonly string[];
                  unique: boolean;
                }>[];
              }>
            >
          >;
          contracts: Readonly<
            Record<
              string,
              Readonly<{
                commandName: string;
                version: string;
                payloadShape: Readonly<IEncodedShape>;
              }>
            >
          >;
        }>;
        serviceFrontendLock?: never;
      }>
    | Readonly<{
        kind: 'service';
        serviceName: string;
        serviceVersion: string;
        aggregateName?: never;
        aggregateFrontendLock?: never;
        serviceFrontendLock: Readonly<{
          systemName: string;
          frontendName: string;
          models: Readonly<
            Record<
              string,
              Readonly<{
                modelName: string;
                abbreviation: string;
                version: string;
                propertiesShape: Readonly<IEncodedShape>;
                indexes: readonly Readonly<{
                  name: string;
                  columns: readonly string[];
                  unique: boolean;
                }>[];
              }>
            >
          >;
        }>;
      }>
  );

/** A browser controller exposing a compatible subset of one aggregate version. */
export type IAggregateFrontend<
  AGGREGATE extends {
    name: string;
    version: string;
    models: IAnyModels;
    contracts: IAnyContractBindings;
  },
> = Readonly<{
  kind: 'aggregate';
  systemName: string;
  aggregateName: AGGREGATE['name'];
  aggregateVersion: AGGREGATE['version'];
  name: string;
  layer: Layer.Layer<never, IAnyError, unknown>;
  models: Partial<AGGREGATE['models']> &
    Readonly<Record<string, AGGREGATE['models'][keyof AGGREGATE['models']]>>;
  contracts: {
    readonly [KEY in keyof AGGREGATE['contracts']]?: Readonly<{
      contract: AGGREGATE['contracts'][KEY]['contract'];
    }>;
  } & Readonly<
    Record<
      string,
      Readonly<{
        contract: AGGREGATE['contracts'][keyof AGGREGATE['contracts']]['contract'];
      }>
    >
  >;
  modelNames: readonly string[];
}>;

/** A browser controller exposing a compatible subset of a service's models. */
export type IServiceFrontend<
  SERVICE extends {
    name: string;
    version: string;
    models: IAnyModels;
  },
> = Readonly<{
  kind: 'service';
  systemName: string;
  serviceName: SERVICE['name'];
  serviceVersion: SERVICE['version'];
  name: string;
  models: Partial<SERVICE['models']> &
    Readonly<Record<string, SERVICE['models'][keyof SERVICE['models']]>>;
  contracts: Readonly<Record<string, never>>;
  modelNames: readonly string[];
}>;
