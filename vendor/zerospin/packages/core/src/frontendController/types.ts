import type { IAnyError } from '@zerospin/error';
import type { IEncodedShape } from '@zerospin/schema';
import { type Effect, type Layer, type Scope } from 'effect';

import type { IAuthentication } from '../authentication/types.ts';
import type {
  IAnyContractBindings,
  IAnyContracts,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
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
  AUTHENTICATION extends Omit<IAuthentication, 'authenticate'> = Omit<
    IAuthentication,
    'authenticate'
  >,
  GUARD_SERVICES = never,
  GUARD_REQUIREMENTS = unknown,
> = Readonly<{
  readonly __initializeRequirements?:
    | LAYER_REQUIREMENTS
    | GUARD_REQUIREMENTS
    | Exclude<
        Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >,
        LAYER_SERVICES | GUARD_SERVICES
      >
    | Scope.Scope;
  layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  guardLayer?: {
    bivarianceHack(
      props: string extends keyof MODELS
        ? never
        : {
            db: Readonly<
              Pick<
                IDb<IResourceDbConfig<MODELS, Record<never, never>>>,
                'query'
              >
            >;
            authentication:
              | AUTHENTICATION['authenticationSchema']['Type']
              | null;
          },
    ): Layer.Layer<GUARD_SERVICES, IAnyError, GUARD_REQUIREMENTS>;
  }['bivarianceHack'];
  kind: 'aggregate';
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  authentication: AUTHENTICATION;
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
  AUTHENTICATION extends Omit<IAuthentication, 'authenticate'> = Omit<
    IAuthentication,
    'authenticate'
  >,
> = Readonly<{
  kind: 'service';
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  authentication: AUTHENTICATION;
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
  readonly __initializeRequirements?: INITIALIZE_REQUIREMENTS | Scope.Scope;
  layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  guardLayer?: {
    bivarianceHack(
      props: unknown,
    ): Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  }['bivarianceHack'];
  kind: 'aggregate';
  systemName: string;
  aggregateName: string;
  aggregateVersion: string;
  authentication: Omit<IAuthentication, 'authenticate'>;
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
  authentication: Omit<IAuthentication, 'authenticate'>;
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
          authentication: Readonly<{
            signatureJsonSchema: unknown;
            authenticationJsonSchema: unknown;
            selectionJsonSchema: unknown;
            pattern: string;
          }>;
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
          authentication: Readonly<{
            signatureJsonSchema: unknown;
            authenticationJsonSchema: unknown;
            selectionJsonSchema: unknown;
            pattern: string;
          }>;
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
    authentication: IAuthentication;
    name: string;
    version: string;
    models: IAnyModels;
    contracts: IAnyContractBindings;
  },
> = Readonly<{
  kind: 'aggregate';
  authentication: Omit<AGGREGATE['authentication'], 'authenticate'>;
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
    authentication: IAuthentication;
    name: string;
    version: string;
    models: IAnyModels;
  },
> = Readonly<{
  kind: 'service';
  authentication: Omit<SERVICE['authentication'], 'authenticate'>;
  systemName: string;
  serviceName: SERVICE['name'];
  serviceVersion: SERVICE['version'];
  name: string;
  models: Partial<SERVICE['models']> &
    Readonly<Record<string, SERVICE['models'][keyof SERVICE['models']]>>;
  contracts: Readonly<Record<string, never>>;
  modelNames: readonly string[];
}>;
