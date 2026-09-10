import type { IAnyError } from '@zerospin/error';
import type {
  CuidFactory,
  IEncodedShape,
  InferIdFromAbbreviation,
} from '@zerospin/schema';
import type { Brand, JsonSchema, Layer } from 'effect';

import type { IAnyAggregate, IAnyAggregates } from '../aggregate/types.ts';
import type { Async } from '../async/Async.ts';
import type { IAuthentication } from '../authentication/types.ts';
import type { IFrontendControllerSpec } from '../frontendController/types.ts';
import type {
  IEncodedResourceShape,
  IModelSpec,
  IRef,
} from '../models/types.ts';
import type { IAnyService, IAnyServices } from '../service/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';

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
  | 'VersionedAggregateRepo'
  | 'ServiceAdmittedChain'
  | 'VersionedServiceRepo'
  | 'VersionedAggregateChain'
  | 'VersionedServiceChain'
  | 'UserVersionedAggregateChain'
  | 'FrontendServiceChain'
  | 'UserVersionedAggregateRepo'
  | 'FrontendVersionedServiceRepo'
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
  readonly models: Readonly<Record<string, IModelSpec>>;
}>;

export type ISystemSpec = Readonly<{
  readonly systemName: string;
  readonly authentication: readonly IAuthentication['spec'][];
  readonly aggregates: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          Readonly<{
            readonly name: string;
            readonly version: string;
            readonly services: Readonly<Record<string, string>>;
            readonly models: Readonly<Record<string, ISystemModelSpec>>;
            readonly contracts: Readonly<Record<string, ISystemContractSpec>>;
            readonly selections: Readonly<
              Record<string, Readonly<{ readonly modelName: string }>>
            >;
          }>
        >
      >
    >
  >;
  readonly services: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          Readonly<{
            readonly name: string;
            readonly version: string;
            readonly historicalDefinitions: readonly Readonly<{
              readonly version: string;
              readonly models: Readonly<Record<string, string>>;
              readonly contracts: Readonly<Record<string, string>>;
            }>[];
            readonly models: Readonly<Record<string, ISystemModelSpec>>;
            readonly contracts: Readonly<Record<string, ISystemContractSpec>>;
            readonly queries: Readonly<
              Record<
                string,
                Readonly<{
                  readonly name: string;
                  readonly serviceName: string;
                  readonly paramsJsonSchema: Readonly<{
                    dialect: 'draft-2020-12';
                    schema: Readonly<JsonSchema.JsonSchema>;
                    definitions: Readonly<
                      Record<string, Readonly<JsonSchema.JsonSchema>>
                    >;
                  }>;
                }>
              >
            >;
            readonly frontends: Readonly<
              Record<
                string,
                Readonly<{
                  readonly name: string;
                  readonly models: Readonly<
                    Record<
                      string,
                      Readonly<{
                        readonly modelName: string;
                        readonly hasProjectionAdapter: boolean;
                      }>
                    >
                  >;
                  readonly contracts: Readonly<
                    Record<
                      string,
                      Readonly<{
                        readonly commandName: string;
                        readonly version: string;
                        readonly hasAuthoritativeAdapter: boolean;
                      }>
                    >
                  >;
                  readonly controller: IFrontendControllerSpec;
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
  AUTHENTICATION extends readonly IAuthentication[] =
    readonly IAuthentication[],
  LAYER_SERVICES = never,
> = {
  readonly layer: Layer.Layer<LAYER_SERVICES, IAnyError>;
  readonly config: (
    options: Readonly<{ systemId: ISystemId }>,
  ) => ISystemConfig<
    ISystem<AGGREGATES, SERVICES, SYSTEM_NAME, AUTHENTICATION, LAYER_SERVICES>
  >;
  readonly name: SYSTEM_NAME;
  readonly authentication: Readonly<AUTHENTICATION>;
  readonly aggregates: Readonly<
    AGGREGATES &
      Record<
        string,
        Readonly<
          Record<
            string,
            IAnyAggregate<
              unknown,
              never,
              unknown,
              LAYER_SERVICES | CuidFactory | MonotonicFactory | Async
            >
          >
        >
      >
  >;
  readonly services: Readonly<
    SERVICES &
      Record<
        string,
        Readonly<
          Record<
            string,
            IAnyService<
              unknown,
              never,
              unknown,
              LAYER_SERVICES | CuidFactory | MonotonicFactory | Async
            >
          >
        >
      >
  >;
};
