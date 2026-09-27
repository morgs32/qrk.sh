import type { IAnyError } from '@zerospin/error';
import type { IEncodedShape, InferIdFromAbbreviation } from '@zerospin/schema';
import type { Brand, JsonSchema, ManagedRuntime } from 'effect';

import type { IAnyAggregate, IAnyAggregates } from '../aggregate/types.ts';
import type { ISelectionQuery } from '../models/SelectionQuerySchema.ts';
import type {
  IEncodedResourceShape,
  IModelSpec,
  IRef,
} from '../models/types.ts';
import type { IAnyService, IAnyServices } from '../service/types.ts';

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

type ISystemModelSpec = Readonly<{
  readonly modelName: string;
  readonly abbreviation: string;
  readonly version: string;
  properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
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
  readonly failureSchemas: Readonly<Record<string, unknown>>;
  readonly models: Readonly<Record<string, IModelSpec>>;
}>;

type ISystemActorSpec = Readonly<{
  models: Readonly<
    Record<string, Readonly<{ modelName: string; version: string }>>
  >;
  name: string;
  version: string;
  authentication: 'none' | Readonly<{ credentialsJsonSchema: unknown }>;
  identity: Readonly<{
    claimsJsonSchema: unknown;
    identityJsonSchema: unknown;
    pattern: string;
  }>;
  selections: Readonly<
    Record<string, Readonly<{ modelName: string; query: ISelectionQuery }>>
  >;
}>;

export type ISystemSpec = Readonly<{
  systemName: string;
  aggregates: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          Readonly<{
            name: string;
            version: string;
            services: Readonly<Record<string, string>>;
            models: Readonly<Record<string, ISystemModelSpec>>;
            actors: Readonly<
              Record<
                string,
                ISystemActorSpec & {
                  contracts: Readonly<Record<string, ISystemContractSpec>>;
                  automations: Readonly<
                    Record<
                      string,
                      {
                        name: string;
                        on: { commandName: string; version: string };
                        contracts: Readonly<
                          Record<string, ISystemContractSpec>
                        >;
                      }
                    >
                  >;
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
            actors: Readonly<Record<string, ISystemActorSpec>>;
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
  AGGREGATES extends Readonly<Record<string, IAnyAggregates>> = Readonly<
    Record<string, IAnyAggregates>
  >,
  SERVICES extends Readonly<Record<string, IAnyServices>> = Readonly<
    Record<string, IAnyServices>
  >,
  SYSTEM_NAME extends string = string,
> = {
  readonly runtime: ManagedRuntime.ManagedRuntime<unknown, IAnyError>;
  readonly name: SYSTEM_NAME;
  readonly aggregates: Readonly<
    AGGREGATES & Record<string, Readonly<Record<string, IAnyAggregate>>>
  >;
  readonly services: Readonly<
    SERVICES & Record<string, Readonly<Record<string, IAnyService>>>
  >;
};
