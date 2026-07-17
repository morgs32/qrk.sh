import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import { JSONSchema, Schema, type Effect } from 'effect';

/* oxlint-disable typescript/no-explicit-any -- adapter callbacks infer their decoded source and destination values from adjacent schemas */

import type { AssertContractsMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import type {
  ICommand,
  IContracts,
  IOperationName,
  IServiceCommand,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IAssertValidModels,
  IModels,
  InferCommandPayload,
  InferPayloadInput,
  IServiceModel,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

import { makeServiceCommand } from './makeServiceCommand.ts';

type IServiceQuery<
  MODELS extends IModels = IModels,
  PARAMS_SCHEMA extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  RESULT = unknown,
> = {
  paramsSchema: PARAMS_SCHEMA;
  query: (props: {
    db: IDb<IResourceDbConfig<MODELS>>;
    params: Schema.Schema.Type<PARAMS_SCHEMA>;
  }) => Effect.Effect<RESULT, IAnyError>;
};

type IServiceQueries<MODELS extends IModels = IModels> = Record<
  string,
  IServiceQuery<MODELS>
>;

type IServiceQueriesInput<
  MODELS extends IModels,
  QUERIES extends IServiceQueries<MODELS>,
> = {
  [K in keyof QUERIES]: QUERIES[K] extends IServiceQuery<
    MODELS,
    infer PARAMS_SCHEMA,
    infer RESULT
  >
    ? IServiceQuery<MODELS, PARAMS_SCHEMA, RESULT>
    : never;
};

type IService<
  NAME extends string = string,
  MODELS extends IModels = IModels,
  CONTRACTS extends IContracts = IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: (
            mutation: any,
          ) => Effect.Effect<any, IAnyError, never>;
        }[]
      >
    >
  > = Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: (
            mutation: any,
          ) => Effect.Effect<any, IAnyError, never>;
        }[]
      >
    >
  >,
  QUERIES extends IServiceQueries<MODELS> = IServiceQueries<MODELS>,
  VERSION extends string = string,
> = {
  name: NAME;
  version: VERSION;
  models: MODELS;
  contracts: CONTRACTS;
  mutationAdapters: MUTATION_ADAPTERS | undefined;
  queries: {
    [K in keyof QUERIES & string]: QUERIES[K] extends IServiceQuery<
      MODELS,
      infer PARAMS_SCHEMA,
      infer RESULT
    >
      ? {
          kind: 'service';
          name: K;
          serviceName: NAME;
          paramsSchema: PARAMS_SCHEMA;
          query: (props: {
            db: IDb<IResourceDbConfig<MODELS>>;
            params: Schema.Schema.Type<PARAMS_SCHEMA>;
          }) => Effect.Effect<RESULT, IAnyError>;
        }
      : never;
  };
  makeCommand: <CONTRACT_NAME extends keyof CONTRACTS & string>(props: {
    contractName: CONTRACT_NAME;
    systemVersion: string;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
  }) => Effect.Effect<
    IServiceCommand<
      ICommand<
        CONTRACTS[CONTRACT_NAME]['commandName'],
        CONTRACTS[CONTRACT_NAME]['version'],
        InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
      >
    >,
    IAnyError,
    CuidFactory
  >;
};

export function makeServiceController<
  NAME extends string,
  MODELS extends IModels,
  CONTRACTS extends IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: (
            mutation: any,
          ) => Effect.Effect<any, IAnyError, never>;
        }[]
      >
    >
  >,
  VERSION extends string,
>(props: {
  name: NAME;
  version: VERSION;
  models: MODELS &
    IAssertValidModels<MODELS> & {
      [K in keyof MODELS]: IServiceModel<MODELS[K], NAME>;
    };
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS, 'service'>;
  mutationAdapters?: MUTATION_ADAPTERS;
  queries?: undefined;
}): IService<NAME, MODELS, CONTRACTS, MUTATION_ADAPTERS, {}, VERSION>;
export function makeServiceController<
  NAME extends string,
  MODELS extends IModels,
  CONTRACTS extends IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: (
            mutation: any,
          ) => Effect.Effect<any, IAnyError, never>;
        }[]
      >
    >
  >,
  QUERIES extends IServiceQueries<MODELS>,
  VERSION extends string,
>(props: {
  name: NAME;
  version: VERSION;
  models: MODELS &
    IAssertValidModels<MODELS> & {
      [K in keyof MODELS]: IServiceModel<MODELS[K], NAME>;
    };
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS, 'service'>;
  mutationAdapters?: MUTATION_ADAPTERS;
  queries: QUERIES & IServiceQueriesInput<MODELS, QUERIES>;
}): IService<NAME, MODELS, CONTRACTS, MUTATION_ADAPTERS, QUERIES, VERSION>;
export function makeServiceController<
  NAME extends string,
  MODELS extends IModels,
  CONTRACTS extends IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: (
            mutation: any,
          ) => Effect.Effect<any, IAnyError, never>;
        }[]
      >
    >
  >,
  QUERIES extends IServiceQueries<MODELS>,
  VERSION extends string,
>(props: {
  name: NAME;
  version: VERSION;
  models: MODELS &
    IAssertValidModels<MODELS> & {
      [K in keyof MODELS]: IServiceModel<MODELS[K], NAME>;
    };
  contracts: CONTRACTS &
    AssertContractsMutationsInModels<CONTRACTS, MODELS, 'service'>;
  mutationAdapters?: MUTATION_ADAPTERS;
  queries?: QUERIES & IServiceQueriesInput<MODELS, QUERIES>;
}): IService<
  NAME,
  MODELS,
  CONTRACTS,
  MUTATION_ADAPTERS,
  QUERIES | {},
  VERSION
> {
  const {
    name,
    version,
    models,
    contracts,
    mutationAdapters,
    queries = {},
  } = props;

  assertValidModels({ models, context: 'makeServiceController' });

  for (const [modelName, model] of Object.entries(models)) {
    if (!('serviceName' in model) || model.serviceName !== name) {
      throw new Error(
        `makeServiceController: models.${modelName} must be created by makeServiceModel with serviceName "${name}"`,
      );
    }
  }

  /**
   * Mutation-adapter validation checkpoints:
   * 1. Read source and destination identity from their declared schemas.
   * 2. Keep sources historical and destinations on this service's current
   *    model version, which also rules out adapter chains.
   * 3. Require non-null edges to provide a requirement-free callback and null
   *    edges to omit one.
   * 4. Require retired service models to cover all five operations for the
   *    same complete source-version set, including replicated ledger rows.
   */
  for (const [sourceModelName, operationAdapters] of Object.entries(
    mutationAdapters ?? {},
  )) {
    const retiredVersionsByOperation = new Map<string, Set<string>>();

    for (const [operationName, edges] of Object.entries(operationAdapters)) {
      if (
        operationName !== 'create' &&
        operationName !== 'update' &&
        operationName !== 'delete' &&
        operationName !== 'move' &&
        operationName !== 'replicateResource'
      ) {
        throw new Error(
          `makeServiceController: mutationAdapters.${sourceModelName}.${operationName} is not a supported mutation operation`,
        );
      }
      if (!Array.isArray(edges)) {
        throw new Error(
          `makeServiceController: mutationAdapters.${sourceModelName}.${operationName} must be an array of direct edges`,
        );
      }

      const sourceVersions = new Set<string>();
      retiredVersionsByOperation.set(operationName, sourceVersions);

      for (const [edgeIndex, edge] of edges.entries()) {
        if (typeof edge !== 'object' || edge === null) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] must be an edge object`,
          );
        }

        const source = Reflect.get(edge, 'source');
        if (!Schema.isSchema(source)) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source must be a mutation schema`,
          );
        }

        const sourceJsonSchema = JSONSchema.make(source);
        const sourceProperties = Reflect.get(sourceJsonSchema, 'properties');
        if (typeof sourceProperties !== 'object' || sourceProperties === null) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has no mutation identity`,
          );
        }
        const sourceModelNameProperty = Reflect.get(
          sourceProperties,
          'modelName',
        );
        const sourceModelVersionProperty = Reflect.get(
          sourceProperties,
          'modelVersion',
        );
        const sourceOperationNameProperty = Reflect.get(
          sourceProperties,
          'operationName',
        );
        if (
          typeof sourceModelNameProperty !== 'object' ||
          sourceModelNameProperty === null ||
          typeof sourceModelVersionProperty !== 'object' ||
          sourceModelVersionProperty === null ||
          typeof sourceOperationNameProperty !== 'object' ||
          sourceOperationNameProperty === null
        ) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has incomplete mutation identity`,
          );
        }
        const sourceModelNames = Reflect.get(sourceModelNameProperty, 'enum');
        const sourceModelVersions = Reflect.get(
          sourceModelVersionProperty,
          'enum',
        );
        const sourceOperationNames = Reflect.get(
          sourceOperationNameProperty,
          'enum',
        );
        const schemaSourceModelName = Array.isArray(sourceModelNames)
          ? sourceModelNames[0]
          : undefined;
        const schemaSourceModelVersion = Array.isArray(sourceModelVersions)
          ? sourceModelVersions[0]
          : undefined;
        const schemaSourceOperationName = Array.isArray(sourceOperationNames)
          ? sourceOperationNames[0]
          : undefined;

        if (schemaSourceModelName !== sourceModelName) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelName is "${String(schemaSourceModelName)}"`,
          );
        }
        if (schemaSourceOperationName !== operationName) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source operationName is "${String(schemaSourceOperationName)}"`,
          );
        }
        if (typeof schemaSourceModelVersion !== 'string') {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelVersion is missing`,
          );
        }
        if (sourceVersions.has(schemaSourceModelVersion)) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName} repeats source version "${schemaSourceModelVersion}"`,
          );
        }
        sourceVersions.add(schemaSourceModelVersion);

        const sourceModel = models[sourceModelName];
        if (sourceModel !== undefined) {
          if (
            !('serviceName' in sourceModel) ||
            sourceModel.serviceName !== name
          ) {
            throw new Error(
              `makeServiceController: mutationAdapters.${sourceModelName} is not owned by service "${name}"`,
            );
          }
          if (schemaSourceModelVersion === sourceModel.version) {
            throw new Error(
              `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is current; adapter sources must be historical`,
            );
          }
          if (
            !sourceModel.historicalDefinitions.some(
              definition => definition.version === schemaSourceModelVersion,
            )
          ) {
            throw new Error(
              `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is not declared by model "${sourceModelName}"`,
            );
          }
        }

        const destination = Reflect.get(edge, 'destination');
        const adapter = Reflect.get(edge, 'adapter');
        if (destination === null) {
          if (adapter !== undefined) {
            throw new Error(
              `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] null destination must omit adapter`,
            );
          }
          continue;
        }
        if (!Schema.isSchema(destination)) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination must be a current mutation schema or null`,
          );
        }
        if (typeof adapter !== 'function') {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] non-null destination requires adapter`,
          );
        }

        const destinationJsonSchema = JSONSchema.make(destination);
        const destinationProperties = Reflect.get(
          destinationJsonSchema,
          'properties',
        );
        if (
          typeof destinationProperties !== 'object' ||
          destinationProperties === null
        ) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has no mutation identity`,
          );
        }
        const destinationModelNameProperty = Reflect.get(
          destinationProperties,
          'modelName',
        );
        const destinationModelVersionProperty = Reflect.get(
          destinationProperties,
          'modelVersion',
        );
        const destinationOperationNameProperty = Reflect.get(
          destinationProperties,
          'operationName',
        );
        if (
          typeof destinationModelNameProperty !== 'object' ||
          destinationModelNameProperty === null ||
          typeof destinationModelVersionProperty !== 'object' ||
          destinationModelVersionProperty === null ||
          typeof destinationOperationNameProperty !== 'object' ||
          destinationOperationNameProperty === null
        ) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has incomplete mutation identity`,
          );
        }
        const destinationModelNames = Reflect.get(
          destinationModelNameProperty,
          'enum',
        );
        const destinationModelVersions = Reflect.get(
          destinationModelVersionProperty,
          'enum',
        );
        const destinationOperationNames = Reflect.get(
          destinationOperationNameProperty,
          'enum',
        );
        const destinationModelName = Array.isArray(destinationModelNames)
          ? destinationModelNames[0]
          : undefined;
        const destinationModelVersion = Array.isArray(destinationModelVersions)
          ? destinationModelVersions[0]
          : undefined;
        const destinationOperationName = Array.isArray(
          destinationOperationNames,
        )
          ? destinationOperationNames[0]
          : undefined;
        if (typeof destinationModelName !== 'string') {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination modelName is missing`,
          );
        }
        const destinationModel = models[destinationModelName];
        if (
          destinationModel === undefined ||
          !('serviceName' in destinationModel) ||
          destinationModel.serviceName !== name
        ) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination model "${destinationModelName}" is not owned by service "${name}"`,
          );
        }
        if (destinationModelVersion !== destinationModel.version) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination version "${String(destinationModelVersion)}" is not current version "${destinationModel.version}"`,
          );
        }
        if (destinationOperationName !== operationName) {
          throw new Error(
            `makeServiceController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination operationName is "${String(destinationOperationName)}"`,
          );
        }
      }
    }

    if (models[sourceModelName] === undefined) {
      const createVersions = retiredVersionsByOperation.get('create');
      for (const requiredOperationName of [
        'create',
        'update',
        'delete',
        'move',
        'replicateResource',
      ]) {
        const operationVersions = retiredVersionsByOperation.get(
          requiredOperationName,
        );
        if (
          createVersions === undefined ||
          createVersions.size === 0 ||
          operationVersions === undefined ||
          operationVersions.size !== createVersions.size
        ) {
          throw new Error(
            `makeServiceController: retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move/replicateResource source version`,
          );
        }
        for (const sourceVersion of createVersions) {
          if (!operationVersions.has(sourceVersion)) {
            throw new Error(
              `makeServiceController: retired model "${sourceModelName}" is missing ${requiredOperationName} adapter for source version "${sourceVersion}"`,
            );
          }
        }
      }
    }
  }

  const providedQueries: IServiceQueries<MODELS> = queries;
  const decoratedQueries: Record<string, unknown> = {};
  for (const [queryName, query] of Object.entries(providedQueries)) {
    decoratedQueries[queryName] = {
      ...query,
      kind: 'service',
      name: queryName,
      serviceName: name,
    };
  }

  const makeCommand: IService<
    NAME,
    MODELS,
    CONTRACTS,
    MUTATION_ADAPTERS,
    QUERIES,
    VERSION
  >['makeCommand'] = props =>
    makeServiceCommand({
      contracts,
      ...props,
      serviceName: name,
    });

  return {
    name,
    version,
    models,
    contracts,
    mutationAdapters,
    queries: decoratedQueries as IService<
      NAME,
      MODELS,
      CONTRACTS,
      MUTATION_ADAPTERS,
      QUERIES
    >['queries'],
    makeCommand,
  };
}
