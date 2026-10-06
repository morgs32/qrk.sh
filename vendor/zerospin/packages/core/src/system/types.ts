import type { IAnyError } from '@zerospin/error';
import type { IEncodedShape, InferIdFromAbbreviation } from '@zerospin/shapes';
import type { Brand, JsonSchema, ManagedRuntime } from 'effect';

import type { IAgentSessionDefinition } from '../agent/types.ts';
import type { IAggregateRegistry, IAnyAggregate } from '../aggregate/types.ts';
import type { IContractSpec } from '../contracts/types.ts';
import type { ISelectionQuery } from '../models/SelectionQuerySchema.ts';
import type {
  IAggregateId,
  IEncodedResourceShape,
  IModelSpec,
  IRef,
} from '../models/types.ts';
import type { IAnyService, IServiceRegistry } from '../service/types.ts';
export type IRefRecord = Record<string, IRef>;
export type IGraph = Record<string, IRefRecord>;
export type IUnstableGraph = Record<string, IEncodedResourceShape>;
export type ISystemEnvironmentId = 'dev' | 'production';
export type ISystemConfig<SYSTEM = ISystem> = Readonly<{
  system: SYSTEM;
  systemId: ISystemId;
}>;
export type IEncodedQuery = {
  readonly Brand?: Brand.Brand<'IEncodedQuery'>;
  method: 'all' | 'get';
  params: unknown[];
  rawSql: string;
};
export type IRepoType =
  | 'SystemRepo'
  | 'AggregateChain'
  | 'AggregateVersionRepo'
  | 'ServiceChain'
  | 'ServiceVersionRepo'
  | 'AggregateVersionChain'
  | 'ServiceVersionChain'
  | 'AggregateActorVersionChain'
  | 'ServiceActorVersionChain'
  | 'AggregateActorVersionRepo'
  | 'ServiceActorVersionRepo'
  | 'SystemLogRepo';
export type IRepoRegistration = Readonly<{
  repoName: string;
  tableNames: readonly string[];
}> &
  (
    | Readonly<{
        repoType: 'AggregateChain';
        aggregateName: string;
        aggregateId: IAggregateId;
      }>
    | Readonly<{
        repoType: Exclude<IRepoType, 'AggregateChain'>;
      }>
  );
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
export type ISystemModelSpec = Readonly<{
  readonly modelName: string;
  readonly abbreviation: string;
  readonly version: string;
  properties: IEncodedShape;
  readonly indexes: readonly Readonly<{
    readonly name: string;
    readonly columns: readonly string[];
    readonly unique?: boolean;
  }>[];
}>;
type ISystemContractSpec = Readonly<{
  readonly commandName: string;
  readonly version: string;
  readonly payloadShape: Readonly<IEncodedShape>;
  readonly failureJsonSchema: unknown;
  readonly resultJsonSchema: unknown;
  readonly failureSchemas: Readonly<Record<string, unknown>>;
  readonly models: Readonly<Record<string, IModelSpec>>;
  original?: IContractSpec;
  external?: Readonly<{
    responseJsonSchema: unknown;
    timeoutMs: number;
    retryDelayMs: number;
  }>;
}>;
type ISystemActorSpec = Readonly<{
  models: Readonly<
    Record<
      string,
      Readonly<{
        modelName: string;
        version: string;
      }>
    >
  >;
  name: string;
  version: string;
  authentication:
    | 'none'
    | 'system'
    | Readonly<{
        credentialsJsonSchema: unknown;
      }>
    | Readonly<{
        service: Readonly<{
          name: string;
          version: string;
        }>;
      }>;
  identity: Readonly<{
    claimsJsonSchema: unknown;
    identityJsonSchema: unknown;
    pattern: string;
  }>;
  selections: Readonly<
    Record<
      string,
      Readonly<{
        modelName: string;
        query: ISelectionQuery;
      }>
    >
  >;
}>;
export type IAgentSpec = Readonly<{
  name: string;
  aggregateName: string;
  aggregateVersion: string;
  actorName: string;
  actorVersion: string;
  sessionName: string;
  claimsJsonSchema: unknown;
  contracts: Readonly<Record<string, ISystemContractSpec>>;
  selections: Readonly<
    Record<
      string,
      Readonly<{
        modelName: string;
        query: ISelectionQuery;
      }>
    >
  >;
  contractBindings: Readonly<
    Record<
      string,
      Readonly<{
        modelName: string;
        bind: Readonly<Record<string, string>>;
      }>
    >
  >;
  models: Readonly<Record<string, ISystemModelSpec>>;
}>;
export type ISystemSpec = Readonly<{
  systemName: string;
  agents: Readonly<Record<string, IAgentSpec>>;
  aggregates: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          Readonly<{
            name: string;
            version: string;
            models: Readonly<Record<string, ISystemModelSpec>>;
            actors: Readonly<
              Record<
                string,
                ISystemActorSpec & {
                  contracts: Readonly<Record<string, ISystemContractSpec>>;
                }
              >
            >;
          }>
        >
      >
    >
  >;
  services: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          Readonly<{
            name: string;
            version: string;
            models: Readonly<Record<string, ISystemModelSpec>>;
            contracts: Readonly<Record<string, ISystemContractSpec>>;
            actors: Readonly<
              Record<
                string,
                ISystemActorSpec & {
                  contracts: Readonly<Record<string, ISystemContractSpec>>;
                }
              >
            >;
            queries: Readonly<
              Record<
                string,
                Readonly<{
                  name: string;
                  serviceName: string;
                  paramsJsonSchema: Readonly<{
                    dialect: 'draft-2020-12';
                    schema: Readonly<JsonSchema.JsonSchema>;
                    definitions: Readonly<
                      Record<string, Readonly<JsonSchema.JsonSchema>>
                    >;
                  }>;
                }>
              >
            >;
          }>
        >
      >
    >
  >;
}>;
export type ISystemLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ISystemLogRow = Readonly<{
  id: InferIdFromAbbreviation<'log'>;
  logIndex: number;
  createdAt: Date;
  source: string;
  message: string;
  level: ISystemLogLevel;
  systemId: ISystemId;
  payload: unknown | null;
}>;
export type ISystemLogState = Readonly<{
  rows: readonly ISystemLogRow[];
  syncedAt: number;
}>;
export type ISystem<
  AGGREGATES extends Readonly<Record<string, IAggregateRegistry>> = Readonly<
    Record<string, IAggregateRegistry>
  >,
  SERVICES extends Readonly<Record<string, IServiceRegistry>> = Readonly<
    Record<string, IServiceRegistry>
  >,
  SYSTEM_NAME extends string = string,
> = {
  readonly agents: Readonly<Record<string, IAgentSessionDefinition>>;
  readonly runtime: ManagedRuntime.ManagedRuntime<unknown, IAnyError>;
  readonly name: SYSTEM_NAME;
  readonly aggregates: Readonly<
    AGGREGATES & Record<string, Readonly<Record<string, IAnyAggregate>>>
  >;
  readonly services: Readonly<
    SERVICES & Record<string, Readonly<Record<string, IAnyService>>>
  >;
};
