import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type {
  IContracts,
  InferCommand,
  IUnstagedCommand,
} from '../contracts/types.ts';
import type { IGuard } from '../guards/makeGuard.ts';
import type {
  IAggregateId,
  IModels,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { ISessionId } from '../session/types.ts';

export type IAggregateFrontendController<
  SYSTEM_NAME extends string = string,
  AGGREGATE_NAME extends string = string,
  FRONTEND_NAME extends string = string,
  CONTRACTS extends IContracts = IContracts,
  MODELS extends IModels = IModels,
  GUARDS extends Record<string, readonly IGuard<string, IModels>[]> = Record<
    string,
    readonly IGuard<string, IModels>[]
  >,
> = {
  kind: 'aggregate';
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  frontendName: FRONTEND_NAME;
  contracts: CONTRACTS;
  models: MODELS;
  modelNames: readonly string[];
  guards: GUARDS;
  makeUnstagedCommand<K extends keyof CONTRACTS & string>(props: {
    commandName: K;
    aggregateId: IAggregateId;
    userId: string;
    sessionId: ISessionId;
    payload: InferPayloadInput<CONTRACTS[K]['payload']>;
  }): Effect.Effect<
    IUnstagedCommand<InferCommand<CONTRACTS[K]>>,
    IAnyError,
    CuidFactory
  >;
};

export type IServiceFrontendController<
  SYSTEM_NAME extends string = string,
  SERVICE_NAME extends string = string,
  FRONTEND_NAME extends string = string,
  MODELS extends IModels = IModels,
> = {
  kind: 'service';
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  frontendName: FRONTEND_NAME;
  contracts: {};
  models: MODELS;
  modelNames: readonly string[];
  guards: {};
};

export type IFrontendController =
  | IAnyAggregateFrontendController
  | IAnyServiceFrontendController;

export type IAnyAggregateFrontendController = {
  kind: 'aggregate';
  systemName: string;
  aggregateName: string;
  frontendName: string;
  contracts: IContracts;
  models: IModels;
  modelNames: readonly string[];
  guards: Record<
    string,
    readonly Readonly<{
      models: IModels;
      program: {
        bivarianceHack(props: unknown): Effect.Effect<void, IAnyError>;
      }['bivarianceHack'];
    }>[]
  >;
  makeUnstagedCommand: (
    props: never,
  ) => Effect.Effect<IUnstagedCommand, IAnyError, CuidFactory>;
};

export type IAnyServiceFrontendController = {
  kind: 'service';
  systemName: string;
  serviceName: string;
  frontendName: string;
  contracts: {};
  models: IModels;
  modelNames: readonly string[];
  guards: {};
};

export type IAnyFrontendController =
  | IAnyAggregateFrontendController
  | IAnyServiceFrontendController;

export type InferFrontendModels<FRONTEND extends IFrontendController> =
  FRONTEND['models'];

export type IFrontendControllerSpec = {
  systemName: string;
  frontendName: string;
  modelNames: readonly string[];
  models: Record<
    string,
    {
      modelName: string;
      abbreviation: string;
      version: string;
      properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      indexes: readonly {
        name: string;
        columns: readonly string[];
        unique?: boolean;
      }[];
      historicalDefinitions: readonly {
        modelName: string;
        abbreviation: string;
        version: string;
        hasDirectAdapter: boolean;
        properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
        indexes: readonly {
          name: string;
          columns: readonly string[];
          unique?: boolean;
        }[];
      }[];
    }
  >;
  contracts: Record<
    string,
    {
      commandName: string;
      version: string;
      payloadJsonSchema: unknown;
      historicalDefinitions: readonly {
        commandName: string;
        version: string;
        hasDirectAdapter: boolean;
        payloadJsonSchema: unknown;
      }[];
    }
  >;
} & (
  | {
      kind: 'aggregate';
      aggregateName: string;
      serviceName?: never;
      aggregateFrontendLock: {
        systemName: string;
        frontendName: string;
        models: Record<
          string,
          {
            modelName: string;
            abbreviation: string;
            version: string;
            propertiesJsonSchema: unknown;
            indexes: readonly {
              name: string;
              columns: readonly string[];
              unique: boolean;
            }[];
          }
        >;
        contracts: Record<
          string,
          {
            commandName: string;
            version: string;
            payloadJsonSchema: unknown;
          }
        >;
      };
      serviceFrontendLock?: never;
    }
  | {
      kind: 'service';
      serviceName: string;
      aggregateName?: never;
      aggregateFrontendLock?: never;
      serviceFrontendLock: {
        systemName: string;
        frontendName: string;
        models: Record<
          string,
          {
            modelName: string;
            abbreviation: string;
            version: string;
            propertiesJsonSchema: unknown;
            indexes: readonly {
              name: string;
              columns: readonly string[];
              unique: boolean;
            }[];
          }
        >;
      };
    }
);
