import type { IAnyError } from '@zerospin/error';
import type { Brand, Effect, Schema } from 'effect';

import type { IAggregates } from '../aggregate/types.ts';
import type { IAuthenticationSignature } from '../authentication/types.ts';
import type { IDeploySeedCommand, IOperationName } from '../contracts/types.ts';
import type { IFrontendControllerSpec } from '../frontendController/types.ts';
import type {
  IEncodedResourceShape,
  InferIdFromAbbreviation,
  IRef,
} from '../models/types.ts';
import type { IServices } from '../service/types.ts';

export type IRefRecord = Record<string, IRef>;

export type IGraph = Record<string, IRefRecord>;

export type IUnstableGraph = Record<string, IEncodedResourceShape>;

export type ISystemEnvironmentId = 'dev' | 'production';

export type ISystemConfig = {
  entry: string;
  supportedPredecessors: readonly string[];
  environmentId: ISystemEnvironmentId;
  env: Record<string, string> | null;
  retention: {
    clientLeaseSeconds: number;
    stagedJournalDays: number;
  };
  seeds: {
    dev: string | null;
    production: string | null;
  };
};

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
  | 'AggregateRepo'
  | 'AggregateFrontendRepo'
  | 'ServiceFrontendRepo'
  | 'ServiceRepo'
  | 'AggregateBlockRepo'
  | 'AggregateFrontendBlockRepo'
  | 'ServiceFrontendBlockRepo'
  | 'ServiceBlockRepo'
  | 'SystemLogRepo';

export type IRepoRegistration = Readonly<{
  generationId: string;
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

type ISystemModelSpec = {
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
};

type ISystemContractSpec = {
  commandName: string;
  version: string;
  payloadJsonSchema: unknown;
  historicalDefinitions: readonly {
    commandName: string;
    version: string;
    hasDirectAdapter: boolean;
    payloadJsonSchema: unknown;
  }[];
};

type ISystemMutationAdaptersSpec = Record<
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

export type ISystemSpec = {
  systemName: string;
  version: string;
  authentication: {
    signature: {
      version: string;
      schemaJsonSchema: unknown;
      historicalDefinitions: readonly {
        version: string;
        schemaJsonSchema: unknown;
        hasDirectAdapter: boolean;
      }[];
    };
  };
  aggregates: Record<
    string,
    {
      name: string;
      models: Record<string, ISystemModelSpec>;
      contracts: Record<string, ISystemContractSpec>;
      mutationAdapters: ISystemMutationAdaptersSpec;
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
          models: Record<
            string,
            { modelName: string; hasProjectionAdapter: boolean }
          >;
          contracts: Record<
            string,
            {
              commandName: string;
              version: string;
              hasAuthoritativeAdapter: boolean;
            }
          >;
          controller: IFrontendControllerSpec;
        }
      >;
    }
  >;
  services: Record<
    string,
    {
      name: string;
      models: Record<string, ISystemModelSpec>;
      contracts: Record<string, ISystemContractSpec>;
      mutationAdapters: ISystemMutationAdaptersSpec;
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
          models: Record<
            string,
            { modelName: string; hasProjectionAdapter: boolean }
          >;
          contracts: Record<
            string,
            {
              commandName: string;
              version: string;
              hasAuthoritativeAdapter: boolean;
            }
          >;
          controller: IFrontendControllerSpec;
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
  payload: unknown | null;
}>;

export type ISystemLogState = Readonly<{
  rows: readonly ISystemLogRow[];
  syncedAt: number;
}>;

export type ISystem<
  AGGREGATES extends IAggregates = IAggregates,
  SERVICES extends IServices = IServices,
  SYSTEM_NAME extends string = string,
  VERSION extends string = string,
  AUTHENTICATION_SIGNATURE extends IAuthenticationSignature =
    IAuthenticationSignature,
  AUTHENTICATE extends (props: {
    signature: Schema.Schema.Type<AUTHENTICATION_SIGNATURE['schema']>;
  }) => Effect.Effect<string, IAnyError> = (props: {
    signature: Schema.Schema.Type<AUTHENTICATION_SIGNATURE['schema']>;
  }) => Effect.Effect<string, IAnyError>,
> = {
  name: SYSTEM_NAME;
  authentication: {
    signature: AUTHENTICATION_SIGNATURE;
    authenticate: AUTHENTICATE;
  };
  aggregates: AGGREGATES & IAggregates;
  services: SERVICES & IServices;
  version: VERSION;
};
