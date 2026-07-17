import type { IAnyError } from '@zerospin/error';
import type { Brand, Effect, Schema } from 'effect';

import type { IAccountControllers } from '../accountController/types.ts';
import type { IActor } from '../actorController/types.ts';
import type {
  IAccountCommand,
  ICommand,
  IContracts,
  IDeploySeedCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAccountCommand,
  IFailedAccountCommand,
  IOperationName,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAccountCursor,
  IEncodedResourceShape,
  IModels,
  InferCommandPayload,
  InferIdFromAbbreviation,
  InferPayloadInput,
  IRef,
} from '../models/types.ts';
import type { IServiceControllers } from '../service/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

export type IRefRecord = Record<string, IRef>;

export type IGraph = Record<string, IRefRecord>;

export type IUnstableGraph = Record<string, IEncodedResourceShape>;

export type ISystemEnvironmentId = 'dev' | 'production';

export type ISystemConfig = {
  entry: string;
  environmentId: ISystemEnvironmentId;
  env: Record<string, string> | null;
  /** Path to a module that exports `seeds` (Effect), relative to project cwd. `null` = no seeds. */
  seeds: string | null;
};

/** Resolved deploy payload sent over CLI RPC (not the on-disk zerospin.config shape). */
export type IDeployConfig = {
  environmentId: ISystemEnvironmentId;
  env: Record<string, string> | null;
  seeds: readonly IDeploySeedCommand[];
};

export type IEncodedQuery = {
  readonly Brand?: Brand.Brand<'IEncodedQuery'>;
  method: 'all' | 'get';
  params: unknown[];
  rawSql: string;
};

export type IRepoType =
  | 'SystemRepo'
  | 'AccountRepo'
  | 'AuthorizationRepo'
  | 'ActorRepo'
  | 'FrontendRepo'
  | 'ServiceRepo'
  | 'AccountBlockRepo'
  | 'ActorBlockRepo'
  | 'FrontendBlockRepo'
  | 'ServiceBlockRepo'
  | 'SystemLogRepo';

export type IRepoRegistration = Readonly<{
  repoType: IRepoType;
  repoName: string;
  tableNames: readonly string[];
}>;

export type IRepoTableData = Readonly<{
  columns: readonly Readonly<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isNullable: boolean;
  }>[];
  rows: readonly Record<string, unknown>[];
}>;

export type ISystemId = InferIdFromAbbreviation<'sys'>;

export type ISystemSpec = {
  systemName: string;
  version: string;
  accountControllers: Record<
    string,
    {
      name: string;
      version: string;
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
          mutationsJsonSchema: unknown | null;
        }
      >;
      mutationAdapters: Record<
        string,
        Partial<
          Record<
            IOperationName,
            readonly {
              source: {
                modelName: string;
                modelVersion: string;
                operationName: IOperationName;
                jsonSchema: unknown;
              };
              destination: {
                modelName: string;
                modelVersion: string;
                operationName: IOperationName;
                jsonSchema: unknown;
              } | null;
            }[]
          >
        >
      >;
      actorControllers: Record<
        string,
        {
          name: string;
          version: string;
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
                properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
                indexes: readonly {
                  name: string;
                  columns: readonly string[];
                  unique?: boolean;
                }[];
              }[];
            }
          >;
          selections: Record<string, { modelName: string }>;
          queries: Record<
            string,
            {
              name: string;
              serviceName: string;
              paramsJsonSchema: unknown;
            }
          >;
          frontends: Record<
            string,
            {
              name: string;
              frontendController: {
                accountName: string;
                actorName: string;
                frontendName: string;
                version: string;
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
                    mutationsJsonSchema: unknown | null;
                  }
                >;
                signatureJsonSchema: unknown;
              };
            }
          >;
        }
      >;
    }
  >;
  serviceControllers: Record<
    string,
    {
      name: string;
      version: string;
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
          mutationsJsonSchema: unknown | null;
        }
      >;
      mutationAdapters: Record<
        string,
        Partial<
          Record<
            IOperationName,
            readonly {
              source: {
                modelName: string;
                modelVersion: string;
                operationName: IOperationName;
                jsonSchema: unknown;
              };
              destination: {
                modelName: string;
                modelVersion: string;
                operationName: IOperationName;
                jsonSchema: unknown;
              } | null;
            }[]
          >
        >
      >;
      queries: Record<
        string,
        {
          name: string;
          serviceName: string;
          paramsJsonSchema: unknown;
        }
      >;
    }
  >;
};

export type ISystemLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ISystemLogRow = Readonly<{
  id: InferIdFromAbbreviation<'log'>;
  logIndex: number;
  createdAt: Date;
  source: string;
  message: string;
  level: ISystemLogLevel;
  systemId: ISystemId;
  generationId: InferIdFromAbbreviation<'gen'>;
  deployId: InferIdFromAbbreviation<'dpl'>;
  payload: unknown | null;
}>;

export type ISystemLogState = Readonly<{
  rows: readonly ISystemLogRow[];
  syncedAt: number;
}>;

/** Decoded authentication payload; pairs with a frontend binding `frontendController` `signature` schema. */
type IAuthenticationSignature<
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext,
> = Schema.Schema.Type<SIGNATURE_SCHEMA>;

type IAuthenticateFinalizeAccountCommands = (props: {
  commands: readonly IAccountCommand[];
}) => Effect.Effect<
  Readonly<{
    executedCommands: readonly IEncodedCommand<IExecutedAccountCommand>[];
    failedCommands: readonly IEncodedCommand<IFailedAccountCommand>[];
    appliedMutations: readonly IEncodedAppliedMutation[];
    lastAccountCursor: IAccountCursor;
    accountIndex: number;
    failure: IAnyError | null;
  }>,
  IAnyError,
  CuidFactory | MonotonicFactory
>;

export type IAuthenticateMakeAccountCommand<
  FRONTEND_CONTRACTS extends IContracts,
> = <CONTRACT_NAME extends keyof FRONTEND_CONTRACTS & string>(props: {
  contractName: CONTRACT_NAME;
  payload: InferPayloadInput<FRONTEND_CONTRACTS[CONTRACT_NAME]['payload']>;
}) => Effect.Effect<
  IAccountCommand<
    ICommand<
      FRONTEND_CONTRACTS[CONTRACT_NAME]['commandName'],
      FRONTEND_CONTRACTS[CONTRACT_NAME]['version'],
      InferCommandPayload<FRONTEND_CONTRACTS[CONTRACT_NAME]['payload']>
    >
  >,
  IAnyError,
  CuidFactory
>;

export type IAuthenticate<
  MODELS extends IModels,
  _ACTOR_MODEL_KEY extends keyof MODELS & string,
  _ACCOUNT_MODEL_KEY extends keyof MODELS & string,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext,
  FRONTEND_CONTRACTS extends IContracts = IContracts,
> = (props: {
  signature: IAuthenticationSignature<SIGNATURE_SCHEMA>;
  db: IDb<IResourceDbConfig<MODELS>>;
  makeAccountCommand: IAuthenticateMakeAccountCommand<FRONTEND_CONTRACTS>;
  finalizeAccountCommands: IAuthenticateFinalizeAccountCommands;
}) => Effect.Effect<IActor, IAnyError, CuidFactory | MonotonicFactory>;

/** Erased authentication on heterogeneous actor frontends. */
export type IAnyAuthentication = {
  signature: Schema.Schema.AnyNoContext;
  /* oxlint-disable typescript/no-explicit-any -- heterogeneous actor authentication */
  authenticate: (props: any) => Effect.Effect<IActor, IAnyError, any>;
  /* oxlint-enable typescript/no-explicit-any */
};

export type ISystem<
  ACCOUNT_CONTROLLERS extends IAccountControllers = IAccountControllers,
  SERVICE_CONTROLLERS extends IServiceControllers = IServiceControllers,
  SYSTEM_NAME extends string = string,
  VERSION extends string = string,
> = {
  name: SYSTEM_NAME;
  accountControllers: ACCOUNT_CONTROLLERS;
  serviceControllers: SERVICE_CONTROLLERS;
  version: VERSION;
};
