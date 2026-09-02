/* oxlint-disable typescript/no-explicit-any -- complete resolved definitions span model-specific resource shapes */
import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';

import { makeAggregateCommand } from '../aggregate/makeAggregateCommand.ts';
import type { IAggregate } from '../aggregate/types.ts';
import type { IAuthenticationSignature } from '../authentication/types.ts';
import {
  identityContractAdapt,
  type IContractAdapterEntry,
} from '../contracts/makeContractAdapter.ts';
import type {
  IContract,
  IContracts,
  IMutation,
  IOperationName,
} from '../contracts/types.ts';
import type {
  IAggregateAuthorization,
  IAggregateFrontendBinding,
  IAggregateFrontendBindingProps,
  IContractAdapters,
  IFrontendModelBindings,
  IResolvedFrontendModels,
  IServiceAuthorization,
  IServiceFrontendBinding,
  IServiceFrontendBindingProps,
} from '../frontendBinding/types.ts';
import type {
  IAnyAggregateFrontendController,
  IAnyServiceFrontendController,
} from '../frontendController/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type { ISelectionWhereProps } from '../models/makeSelection.ts';
import type {
  IAggregateId,
  IAssertValidModels,
  IModel,
  IModelReplica,
  IModels,
  InferPayloadInput,
} from '../models/types.ts';
import { makeServiceCommand } from '../service/makeServiceCommand.ts';
import type {
  IResolvedServiceQuery,
  IService,
  IServiceQuery,
} from '../service/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import type { ISystem } from './types.ts';

type IMutationAdapters<MODELS extends IModels> = Partial<{
  readonly [MODEL_NAME in keyof MODELS]: Partial<{
    readonly [OPERATION_NAME in IOperationName]: readonly (
      | {
          source: Schema.Codec<any, any>;
          destination: Schema.Codec<any, any>;
          adapter: (
            mutation: IMutation<
              IModel<
                IModel['attributes'],
                MODELS[MODEL_NAME]['abbreviation'],
                MODELS[MODEL_NAME]['modelName']
              >,
              OPERATION_NAME
            >,
          ) => Effect.Effect<unknown, IAnyError>;
        }
      | {
          source: Schema.Codec<any, any>;
          destination: null;
          adapter?: never;
        }
    )[];
  }>;
}>;

type IAggregateFrontendBindingInput = {
  controller: IAnyAggregateFrontendController;
  models?: Record<string, string>;
  projectionAdapters?: Record<string, unknown>;
  contractAdapters?: Record<string, IContractAdapterEntry>;
};

type IServiceFrontendBindingInput = {
  controller: IAnyServiceFrontendController;
  models?: Record<string, string>;
  projectionAdapters?: Record<string, unknown>;
};

type IAggregateInput = {
  models: IModels;
  contracts: IContracts;
  mutationAdapters?: Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Codec<any, any>;
          destination: Schema.Codec<any, any> | null;
          adapter?: unknown;
        }[]
      >
    >
  >;
  selections: Record<
    string,
    {
      model: IModel;
      where: (props: ISelectionWhereProps) => Record<string, unknown>;
    }
  >;
  queries?: Record<string, { service: string; query: string }>;
  frontends: Record<string, IAggregateFrontendBindingInput>;
  authorize?: unknown;
};

type IServiceInput = {
  models: IModels;
  contracts: IContracts;
  mutationAdapters?: Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Codec<any, any>;
          destination: Schema.Codec<any, any> | null;
          adapter?: unknown;
        }[]
      >
    >
  >;
  queries?: Record<string, IServiceQuery>;
  frontends?: Record<string, IServiceFrontendBindingInput>;
  authorize?: unknown;
};

type IModelBindingsAt<
  BINDING,
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
> = BINDING extends {
  models: infer MODEL_BINDINGS extends IFrontendModelBindings<
    FRONTEND_MODELS,
    SOURCE_MODELS
  >;
}
  ? MODEL_BINDINGS
  : undefined;

type IContractAdaptersAt<
  BINDING,
  CONTRACTS extends IContracts,
> = BINDING extends {
  contractAdapters: infer CONTRACT_ADAPTERS extends
    IContractAdapters<CONTRACTS>;
}
  ? CONTRACT_ADAPTERS
  : {};

type IValidateAggregateFrontends<
  SYSTEM_NAME extends string,
  AGGREGATE_NAME extends string,
  MODELS extends IModels,
  BINDINGS extends Record<string, IAggregateFrontendBindingInput>,
  CONTROLLERS extends Record<string, IAnyAggregateFrontendController>,
> = {
  [FRONTEND_NAME in keyof BINDINGS &
    keyof CONTROLLERS &
    string]: BINDINGS[FRONTEND_NAME] &
    IAggregateFrontendBindingProps<
      MODELS,
      CONTROLLERS[FRONTEND_NAME],
      IContractAdaptersAt<
        BINDINGS[FRONTEND_NAME],
        CONTROLLERS[FRONTEND_NAME]['contracts']
      >,
      IModelBindingsAt<
        BINDINGS[FRONTEND_NAME],
        CONTROLLERS[FRONTEND_NAME]['models'],
        MODELS
      >
    > & {
      controller: CONTROLLERS[FRONTEND_NAME] & {
        systemName: SYSTEM_NAME;
        aggregateName: AGGREGATE_NAME;
        frontendName: FRONTEND_NAME;
        models: CONTROLLERS[FRONTEND_NAME]['models'] & {
          [MODEL_KEY in keyof CONTROLLERS[FRONTEND_NAME]['models'] &
            keyof IResolvedFrontendModels<
              CONTROLLERS[FRONTEND_NAME]['models'],
              MODELS,
              IModelBindingsAt<
                BINDINGS[FRONTEND_NAME],
                CONTROLLERS[FRONTEND_NAME]['models'],
                MODELS
              >
            >]: CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY] extends {
            modelName: infer FRONTEND_MODEL_NAME extends string;
          }
            ? IResolvedFrontendModels<
                CONTROLLERS[FRONTEND_NAME]['models'],
                MODELS,
                IModelBindingsAt<
                  BINDINGS[FRONTEND_NAME],
                  CONTROLLERS[FRONTEND_NAME]['models'],
                  MODELS
                >
              >[MODEL_KEY] extends infer SOURCE_MODEL extends IModel
              ? SOURCE_MODEL['modelName'] extends FRONTEND_MODEL_NAME
                ? FRONTEND_MODEL_NAME extends SOURCE_MODEL['modelName']
                  ? CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY] extends SOURCE_MODEL
                    ? SOURCE_MODEL extends CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY]
                      ? CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY]
                      : ITypeError<`Aggregate frontend model "${MODEL_KEY & string}" must exactly match its identity-bound source model`>
                    : ITypeError<`Aggregate frontend model "${MODEL_KEY & string}" must exactly match its identity-bound source model`>
                  : CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY]
                : CONTROLLERS[FRONTEND_NAME]['models'][MODEL_KEY]
              : never
            : never;
        };
      };
    };
};

type IValidateServiceFrontends<
  SYSTEM_NAME extends string,
  SERVICE_NAME extends string,
  MODELS extends IModels,
  BINDINGS extends Record<string, IServiceFrontendBindingInput>,
  CONTROLLERS extends Record<string, IAnyServiceFrontendController>,
> = {
  [FRONTEND_NAME in keyof BINDINGS &
    keyof CONTROLLERS &
    string]: BINDINGS[FRONTEND_NAME] &
    IServiceFrontendBindingProps<
      MODELS,
      CONTROLLERS[FRONTEND_NAME],
      IModelBindingsAt<
        BINDINGS[FRONTEND_NAME],
        CONTROLLERS[FRONTEND_NAME]['models'],
        MODELS
      >
    > & {
      controller: CONTROLLERS[FRONTEND_NAME] & {
        systemName: SYSTEM_NAME;
        serviceName: SERVICE_NAME;
        frontendName: FRONTEND_NAME;
      };
    };
};

type IResolvedAggregateFrontends<
  MODELS extends IModels,
  FRONTENDS extends Record<string, IAggregateFrontendBindingInput>,
> = {
  [FRONTEND_NAME in keyof FRONTENDS &
    string]: FRONTENDS[FRONTEND_NAME] extends {
    controller: infer CONTROLLER extends IAnyAggregateFrontendController;
  }
    ? IAggregateFrontendBinding<
        FRONTEND_NAME,
        MODELS,
        CONTROLLER,
        IContractAdaptersAt<FRONTENDS[FRONTEND_NAME], CONTROLLER['contracts']>,
        IModelBindingsAt<FRONTENDS[FRONTEND_NAME], CONTROLLER['models'], MODELS>
      >
    : never;
};

type IResolvedServiceFrontends<
  MODELS extends IModels,
  FRONTENDS extends Record<string, IServiceFrontendBindingInput>,
> = {
  [FRONTEND_NAME in keyof FRONTENDS &
    string]: FRONTENDS[FRONTEND_NAME] extends {
    controller: infer CONTROLLER extends IAnyServiceFrontendController;
  }
    ? IServiceFrontendBinding<
        FRONTEND_NAME,
        MODELS,
        CONTROLLER,
        IModelBindingsAt<FRONTENDS[FRONTEND_NAME], CONTROLLER['models'], MODELS>
      >
    : never;
};

type IResolvedServiceQueries<
  SERVICE_NAME extends string,
  MODELS extends IModels,
  QUERIES extends Record<string, unknown>,
> = {
  [QUERY_NAME in keyof QUERIES &
    string]: QUERIES[QUERY_NAME] extends IServiceQuery<
    MODELS,
    infer PARAMS_SCHEMA,
    infer RESULT
  >
    ? IResolvedServiceQuery<
        SERVICE_NAME,
        QUERY_NAME,
        MODELS,
        PARAMS_SCHEMA,
        RESULT
      >
    : never;
};

type IResolvedServices<
  SERVICES extends Record<string, unknown>,
  AUTHORIZATIONS extends {
    [SERVICE_NAME in keyof SERVICES]: unknown;
  },
> = {
  [SERVICE_NAME in keyof SERVICES & string]: SERVICES[SERVICE_NAME] extends {
    models: infer MODELS extends IModels;
    contracts: infer CONTRACTS extends IContracts;
  }
    ? IService<
        SERVICE_NAME,
        MODELS,
        CONTRACTS,
        SERVICES[SERVICE_NAME] extends {
          mutationAdapters: infer MUTATION_ADAPTERS extends NonNullable<
            IServiceInput['mutationAdapters']
          >;
        }
          ? MUTATION_ADAPTERS
          : {},
        SERVICES[SERVICE_NAME] extends {
          queries: infer QUERIES extends Record<string, unknown>;
        }
          ? IResolvedServiceQueries<SERVICE_NAME, MODELS, QUERIES>
          : {},
        SERVICES[SERVICE_NAME] extends {
          frontends: infer FRONTENDS extends Record<
            string,
            IServiceFrontendBindingInput
          >;
        }
          ? IResolvedServiceFrontends<MODELS, FRONTENDS>
          : {},
        AUTHORIZATIONS[SERVICE_NAME] &
          IServiceAuthorization<
            SERVICES[SERVICE_NAME] extends {
              frontends: infer FRONTENDS extends Record<
                string,
                IServiceFrontendBindingInput
              >;
            }
              ? IResolvedServiceFrontends<MODELS, FRONTENDS>
              : {},
            MODELS,
            never
          >
      >
    : never;
};

type IResolvedAggregateQueries<
  QUERIES extends Record<string, { service: string; query: string }>,
  SERVICES extends Record<
    string,
    { queries: Record<string, IResolvedServiceQuery> }
  >,
> = {
  [QUERY_NAME in keyof QUERIES]: QUERIES[QUERY_NAME] extends {
    service: infer SERVICE_NAME extends keyof SERVICES;
    query: infer SERVICE_QUERY_NAME;
  }
    ? SERVICE_QUERY_NAME extends keyof SERVICES[SERVICE_NAME]['queries']
      ? Extract<
          SERVICES[SERVICE_NAME]['queries'][SERVICE_QUERY_NAME],
          IResolvedServiceQuery
        >
      : never
    : never;
};

type IResolvedAggregates<
  AGGREGATES extends Record<string, unknown>,
  FRONTENDS extends {
    [AGGREGATE_NAME in keyof AGGREGATES]: Record<
      string,
      IAggregateFrontendBindingInput
    >;
  },
  SERVICES extends Record<
    string,
    { queries: Record<string, IResolvedServiceQuery> }
  >,
  AUTHORIZATIONS extends {
    [AGGREGATE_NAME in keyof AGGREGATES]: unknown;
  },
> = {
  [AGGREGATE_NAME in keyof AGGREGATES & string]: AGGREGATES[AGGREGATE_NAME] extends {
    models: infer MODELS extends IModels;
    contracts: infer CONTRACTS extends IContracts;
    selections: infer SELECTIONS extends IAggregateInput['selections'];
  }
    ? IAggregate<
        AGGREGATE_NAME,
        MODELS,
        CONTRACTS,
        AGGREGATES[AGGREGATE_NAME] extends {
          mutationAdapters: infer MUTATION_ADAPTERS extends NonNullable<
            IAggregateInput['mutationAdapters']
          >;
        }
          ? MUTATION_ADAPTERS
          : {},
        SELECTIONS,
        AGGREGATES[AGGREGATE_NAME] extends {
          queries: infer QUERIES extends Record<
            string,
            { service: string; query: string }
          >;
        }
          ? IResolvedAggregateQueries<QUERIES, SERVICES>
          : {},
        IResolvedAggregateFrontends<MODELS, FRONTENDS[AGGREGATE_NAME]>,
        AUTHORIZATIONS[AGGREGATE_NAME] &
          IAggregateAuthorization<
            IResolvedAggregateFrontends<MODELS, FRONTENDS[AGGREGATE_NAME]>,
            MODELS,
            never
          >
      >
    : never;
};

export function makeSystem<
  SYSTEM_NAME extends string,
  VERSION extends string,
  AUTHENTICATION_SIGNATURE extends IAuthenticationSignature,
  AUTHENTICATE extends unknown,
  const AGGREGATES extends Record<string, IAggregateInput>,
  const AGGREGATE_MODELS extends {
    [AGGREGATE_NAME in keyof AGGREGATES]: IModels;
  },
  const AGGREGATE_FRONTENDS extends {
    [AGGREGATE_NAME in keyof AGGREGATES]: Record<
      string,
      IAggregateFrontendBindingInput
    >;
  },
  const AGGREGATE_AUTHORIZATIONS extends {
    [AGGREGATE_NAME in keyof AGGREGATES]: unknown;
  } = { [AGGREGATE_NAME in keyof AGGREGATES]: unknown },
  const SERVICES extends Record<string, unknown> = {},
  const SERVICE_MODELS extends {
    [SERVICE_NAME in keyof SERVICES]: IModels;
  } = { [SERVICE_NAME in keyof SERVICES]: IModels },
  const SERVICE_QUERIES extends {
    [SERVICE_NAME in keyof SERVICES]: Record<
      string,
      IServiceQuery<SERVICE_MODELS[SERVICE_NAME]>
    >;
  } = {
    [SERVICE_NAME in keyof SERVICES]: Record<
      string,
      IServiceQuery<SERVICE_MODELS[SERVICE_NAME]>
    >;
  },
  const SERVICE_AUTHORIZATIONS extends {
    [SERVICE_NAME in keyof SERVICES]: unknown;
  } = { [SERVICE_NAME in keyof SERVICES]: unknown },
>(props: {
  name: SYSTEM_NAME;
  version: VERSION;
  authentication: {
    signature: AUTHENTICATION_SIGNATURE;
    authenticate: AUTHENTICATE &
      ((props: {
        signature: Schema.Schema.Type<AUTHENTICATION_SIGNATURE['schema']>;
      }) => Effect.Effect<string, IAnyError>);
  };
  aggregates: AGGREGATES & {
    [AGGREGATE_NAME in keyof AGGREGATES &
      keyof AGGREGATE_MODELS &
      keyof AGGREGATE_FRONTENDS &
      string]: AGGREGATES[AGGREGATE_NAME] & {
      models: AGGREGATE_MODELS[AGGREGATE_NAME] &
        IAssertValidModels<AGGREGATE_MODELS[AGGREGATE_NAME]>;
      contracts: IContracts;
      mutationAdapters?: IMutationAdapters<AGGREGATE_MODELS[AGGREGATE_NAME]>;
      selections: Record<
        string,
        {
          model: IModel;
          where: (
            props: ISelectionWhereProps<string>,
          ) => Record<string, unknown>;
        }
      >;
      queries?: Record<string, { service: string; query: string }>;
      frontends: AGGREGATE_FRONTENDS[AGGREGATE_NAME] &
        IValidateAggregateFrontends<
          SYSTEM_NAME,
          AGGREGATE_NAME,
          AGGREGATE_MODELS[AGGREGATE_NAME],
          AGGREGATE_FRONTENDS[AGGREGATE_NAME],
          {
            [FRONTEND_NAME in keyof AGGREGATE_FRONTENDS[AGGREGATE_NAME] &
              string]: AGGREGATE_FRONTENDS[AGGREGATE_NAME][FRONTEND_NAME]['controller'];
          }
        >;
    } & ([keyof AGGREGATE_FRONTENDS[AGGREGATE_NAME]] extends [never]
        ? { authorize?: never }
        : {
            authorize: AGGREGATE_AUTHORIZATIONS[AGGREGATE_NAME] &
              IAggregateAuthorization<
                IResolvedAggregateFrontends<
                  AGGREGATE_MODELS[AGGREGATE_NAME],
                  AGGREGATE_FRONTENDS[AGGREGATE_NAME]
                >,
                AGGREGATE_MODELS[AGGREGATE_NAME],
                never
              >;
          });
  };
  services?: SERVICES & {
    [SERVICE_NAME in keyof NoInfer<SERVICES> &
      keyof SERVICE_MODELS &
      keyof SERVICE_QUERIES &
      string]: NoInfer<SERVICES>[SERVICE_NAME] & {
      models: SERVICE_MODELS[SERVICE_NAME] &
        IAssertValidModels<SERVICE_MODELS[SERVICE_NAME]> & {
          [MODEL_NAME in keyof SERVICE_MODELS[SERVICE_NAME]]: SERVICE_MODELS[SERVICE_NAME][MODEL_NAME] extends IModelReplica
            ? ITypeError<`Service "${SERVICE_NAME}" must register the authoritative source model, not replica "${SERVICE_MODELS[SERVICE_NAME][MODEL_NAME]['modelName']}"`>
            : SERVICE_MODELS[SERVICE_NAME][MODEL_NAME];
        };
      contracts: IContracts;
      mutationAdapters?: IMutationAdapters<SERVICE_MODELS[SERVICE_NAME]>;
      queries?: SERVICE_QUERIES[SERVICE_NAME];
    } & (
        | {
            frontends?: Readonly<Record<string, never>>;
            authorize?: never;
          }
        | {
            frontends: NoInfer<SERVICES>[SERVICE_NAME] extends {
              frontends: infer FRONTENDS extends Record<
                string,
                IServiceFrontendBindingInput
              >;
            }
              ? FRONTENDS &
                  IValidateServiceFrontends<
                    SYSTEM_NAME,
                    SERVICE_NAME,
                    SERVICE_MODELS[SERVICE_NAME],
                    FRONTENDS,
                    {
                      [FRONTEND_NAME in keyof FRONTENDS & string]: FRONTENDS[FRONTEND_NAME]['controller'];
                    }
                  >
              : never;
            authorize: SERVICE_AUTHORIZATIONS[SERVICE_NAME] &
              {
                bivarianceHack(
                  props: unknown,
                ): Effect.Effect<void, IAnyError, never>;
              }['bivarianceHack'];
          }
      );
  };
}): ISystem<
  IResolvedAggregates<
    AGGREGATES,
    AGGREGATE_FRONTENDS,
    IResolvedServices<SERVICES, SERVICE_AUTHORIZATIONS>,
    AGGREGATE_AUTHORIZATIONS
  >,
  IResolvedServices<SERVICES, SERVICE_AUTHORIZATIONS>,
  SYSTEM_NAME,
  VERSION,
  AUTHENTICATION_SIGNATURE,
  AUTHENTICATE &
    ((props: {
      signature: Schema.Schema.Type<AUTHENTICATION_SIGNATURE['schema']>;
    }) => Effect.Effect<string, IAnyError>)
>;

export function makeSystem(props: {
  name: string;
  version: string;
  authentication: {
    signature: IAuthenticationSignature;
    authenticate: (props: {
      signature: unknown;
    }) => Effect.Effect<string, IAnyError>;
  };
  aggregates: Record<string, IAggregateInput>;
  services?: Record<string, IServiceInput>;
}): {
  name: string;
  version: string;
  authentication: {
    signature: IAuthenticationSignature;
    authenticate: (props: {
      signature: unknown;
    }) => Effect.Effect<string, IAnyError>;
  };
  aggregates: Record<string, unknown>;
  services: Record<string, unknown>;
} {
  const {
    name,
    version,
    authentication,
    aggregates: aggregateInputs,
    services: serviceInputs = {},
  }: {
    name: string;
    version: string;
    authentication: {
      signature: IAuthenticationSignature;
      authenticate: (props: {
        signature: unknown;
      }) => Effect.Effect<string, IAnyError>;
    };
    aggregates: Readonly<Record<string, IAggregateInput>>;
    services?: Readonly<Record<string, IServiceInput>>;
  } = props;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('makeSystem: version must be a non-empty string');
  }
  if (!Schema.isSchema(authentication.signature.schema)) {
    throw new Error(
      'makeSystem: authentication.signature must be created by makeSignature',
    );
  }
  if (typeof authentication.authenticate !== 'function') {
    throw new Error(
      'makeSystem: authentication.authenticate must be a function',
    );
  }

  const serviceNameBySourceModel = new Map<IModel, string>();
  const services = mapValues(serviceInputs, (service, serviceKey) => {
    const serviceName = String(serviceKey);
    const {
      models,
      contracts,
      mutationAdapters,
      queries: queryInputs = {},
      frontends: frontendInputs = {},
      authorize,
    } = service;

    const hasFrontends = Object.keys(frontendInputs).length > 0;
    if (!hasFrontends && authorize !== undefined) {
      throw new Error(
        `makeSystem: services.${serviceName} must omit authorize when it has no frontends`,
      );
    }
    if (hasFrontends && typeof authorize !== 'function') {
      throw new Error(
        `makeSystem: services.${serviceName}.authorize must be a function when the service has frontends`,
      );
    }

    assertValidModels({
      models,
      context: `makeSystem: services.${serviceName}`,
    });

    for (const [modelKey, model] of Object.entries(models)) {
      if ('sourceModel' in model) {
        throw new Error(
          `makeSystem: services.${serviceName}.models.${modelKey} must be the authoritative source model, not a replica`,
        );
      }
      const priorServiceName = serviceNameBySourceModel.get(model);
      if (priorServiceName !== undefined) {
        throw new Error(
          `makeSystem: services.${serviceName}.models.${modelKey} reuses a source model already owned by service "${priorServiceName}"`,
        );
      }
      serviceNameBySourceModel.set(model, serviceName);
    }

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
            `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName} is not a supported mutation operation`,
          );
        }
        if (!Array.isArray(edges)) {
          throw new Error(
            `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName} must be an array of direct edges`,
          );
        }

        const sourceVersions = new Set<string>();
        retiredVersionsByOperation.set(operationName, sourceVersions);

        for (const [edgeIndex, edge] of edges.entries()) {
          if (typeof edge !== 'object' || edge === null) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] must be an edge object`,
            );
          }

          const source = Reflect.get(edge, 'source');
          if (!Schema.isSchema(source)) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source must be a mutation schema`,
            );
          }

          const sourceJsonSchema = Schema.toJsonSchemaDocument(source);
          const sourceProperties = Reflect.get(
            sourceJsonSchema.schema,
            'properties',
          );
          if (
            typeof sourceProperties !== 'object' ||
            sourceProperties === null
          ) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has no mutation identity`,
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
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has incomplete mutation identity`,
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
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelName is "${String(schemaSourceModelName)}"`,
            );
          }
          if (schemaSourceOperationName !== operationName) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source operationName is "${String(schemaSourceOperationName)}"`,
            );
          }
          if (typeof schemaSourceModelVersion !== 'string') {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelVersion is missing`,
            );
          }
          if (sourceVersions.has(schemaSourceModelVersion)) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName} repeats source version "${schemaSourceModelVersion}"`,
            );
          }
          sourceVersions.add(schemaSourceModelVersion);

          const sourceModel = models[sourceModelName];
          if (sourceModel !== undefined) {
            if (schemaSourceModelVersion === sourceModel.version) {
              throw new Error(
                `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is current; adapter sources must be historical`,
              );
            }
            if (
              !sourceModel.historicalDefinitions.some(
                definition => definition.version === schemaSourceModelVersion,
              )
            ) {
              throw new Error(
                `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is not declared by model "${sourceModelName}"`,
              );
            }
          }

          const destination = Reflect.get(edge, 'destination');
          const adapter = Reflect.get(edge, 'adapter');
          if (destination === null) {
            if (adapter !== undefined) {
              throw new Error(
                `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] null destination must omit adapter`,
              );
            }
            continue;
          }
          if (!Schema.isSchema(destination)) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination must be a current mutation schema or null`,
            );
          }
          if (typeof adapter !== 'function') {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] non-null destination requires adapter`,
            );
          }

          const destinationJsonSchema =
            Schema.toJsonSchemaDocument(destination);
          const destinationProperties = Reflect.get(
            destinationJsonSchema.schema,
            'properties',
          );
          if (
            typeof destinationProperties !== 'object' ||
            destinationProperties === null
          ) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has no mutation identity`,
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
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has incomplete mutation identity`,
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
          const destinationModelVersion = Array.isArray(
            destinationModelVersions,
          )
            ? destinationModelVersions[0]
            : undefined;
          const destinationOperationName = Array.isArray(
            destinationOperationNames,
          )
            ? destinationOperationNames[0]
            : undefined;
          if (typeof destinationModelName !== 'string') {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination modelName is missing`,
            );
          }
          const destinationModel = models[destinationModelName];
          if (destinationModel === undefined) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination model "${destinationModelName}" is not owned by service "${serviceName}"`,
            );
          }
          if (destinationModelVersion !== destinationModel.version) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination version "${String(destinationModelVersion)}" is not current version "${destinationModel.version}"`,
            );
          }
          if (destinationOperationName !== operationName) {
            throw new Error(
              `makeSystem: services.${serviceName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination operationName is "${String(destinationOperationName)}"`,
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
              `makeSystem: services.${serviceName} retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move/replicateResource source version`,
            );
          }
          for (const sourceVersion of createVersions) {
            if (!operationVersions.has(sourceVersion)) {
              throw new Error(
                `makeSystem: services.${serviceName} retired model "${sourceModelName}" is missing ${requiredOperationName} adapter for source version "${sourceVersion}"`,
              );
            }
          }
        }
      }
    }

    const queries = mapValues(queryInputs, (query, queryKey) => ({
      ...query,
      kind: 'service' satisfies 'service',
      name: String(queryKey),
      serviceName,
    }));

    const frontends = mapValues(frontendInputs, (binding, frontendKey) => {
      const frontendName = String(frontendKey);
      const {
        controller,
        models: authoredModelBindings,
        projectionAdapters = {},
      } = binding;

      if (controller.kind !== 'service') {
        throw new Error(
          `makeSystem: services.${serviceName}.frontends.${frontendName}.controller must be service-owned`,
        );
      }
      if (controller.systemName !== name) {
        throw new Error(
          `makeSystem: services.${serviceName}.frontends.${frontendName}.controller must have systemName "${name}", received "${controller.systemName}"`,
        );
      }
      if (controller.serviceName !== serviceName) {
        throw new Error(
          `makeSystem: services.${serviceName}.frontends.${frontendName}.controller must have serviceName "${serviceName}", received "${controller.serviceName}"`,
        );
      }
      if (controller.frontendName !== frontendName) {
        throw new Error(
          `makeSystem: services.${serviceName}.frontends.${frontendName}.controller must have frontendName "${frontendName}", received "${controller.frontendName}"`,
        );
      }
      const resolvedModelBindings: Record<string, string> = {};
      if (authoredModelBindings === undefined) {
        for (const modelKey of Object.keys(controller.models)) {
          if (models[modelKey] !== undefined) {
            resolvedModelBindings[modelKey] = modelKey;
          }
        }
      } else {
        Object.assign(resolvedModelBindings, authoredModelBindings);
      }

      const bindingModels: Record<string, IModel> = {};
      const usedSourceModelKeys = new Set<string>();
      for (const [frontendModelKey, sourceModelKey] of Object.entries(
        resolvedModelBindings,
      )) {
        const frontendModel = controller.models[frontendModelKey];
        if (frontendModel === undefined) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.models.${frontendModelKey} is not a frontend model`,
          );
        }
        const sourceModel = models[sourceModelKey];
        if (sourceModel === undefined) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.models.${frontendModelKey} references missing service model "${sourceModelKey}"`,
          );
        }
        if (usedSourceModelKeys.has(sourceModelKey)) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.models must not bind service model "${sourceModelKey}" more than once`,
          );
        }
        usedSourceModelKeys.add(sourceModelKey);
        bindingModels[frontendModelKey] = sourceModel;
      }

      for (const [frontendModelKey, sourceModel] of Object.entries(
        bindingModels,
      )) {
        const frontendModel = controller.models[frontendModelKey];
        if (frontendModel === undefined) {
          continue;
        }
        const diverges = sourceModel.modelName !== frontendModel.modelName;
        const hasAdapter = frontendModelKey in projectionAdapters;
        if (!diverges && !isEqual(sourceModel.spec, frontendModel.spec)) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.models.${frontendModelKey} must exactly match service model "${sourceModel.modelName}" when no projection adapter is allowed`,
          );
        }
        if (diverges && !hasAdapter) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.projectionAdapters.${frontendModelKey} is required when source modelName "${sourceModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`,
          );
        }
        if (!diverges && hasAdapter) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.projectionAdapters.${frontendModelKey} must not be set when source and frontend modelName both equal "${frontendModel.modelName}"`,
          );
        }
      }

      for (const adapterKey of Object.keys(projectionAdapters)) {
        if (bindingModels[adapterKey] === undefined) {
          throw new Error(
            `makeSystem: services.${serviceName}.frontends.${frontendName}.projectionAdapters.${adapterKey} has no matching binding model`,
          );
        }
      }

      return {
        name: frontendName,
        controller,
        models: bindingModels,
        projectionAdapters,
      };
    });

    const makeCommand = <
      CONTRACT_NAME extends keyof typeof contracts & string,
    >(commandProps: {
      contractName: CONTRACT_NAME;
      payload: InferPayloadInput<(typeof contracts)[CONTRACT_NAME]['payload']>;
    }) =>
      makeServiceCommand({
        contracts,
        serviceName,
        ...commandProps,
      });

    const resolvedService = {
      name: serviceName,
      models,
      contracts,
      mutationAdapters,
      queries,
      frontends,
      makeCommand,
    };
    return hasFrontends ? { ...resolvedService, authorize } : resolvedService;
  });

  const aggregates = mapValues(aggregateInputs, (aggregate, aggregateKey) => {
    const aggregateName = String(aggregateKey);
    const {
      models,
      contracts,
      mutationAdapters,
      selections,
      queries: queryGrants = {},
      frontends: frontendInputs,
      authorize,
    } = aggregate;

    const hasFrontends = Object.keys(frontendInputs).length > 0;
    if (!hasFrontends && authorize !== undefined) {
      throw new Error(
        `makeSystem: aggregates.${aggregateName} must omit authorize when it has no frontends`,
      );
    }
    if (hasFrontends && typeof authorize !== 'function') {
      throw new Error(
        `makeSystem: aggregates.${aggregateName}.authorize must be a function when the aggregate has frontends`,
      );
    }

    assertValidModels({
      models,
      context: `makeSystem: aggregates.${aggregateName}`,
    });

    for (const [modelKey, model] of Object.entries(models)) {
      if ('sourceModel' in model) {
        const sourceModel = Reflect.get(model, 'sourceModel');
        const sourceServiceName = Reflect.get(model, 'serviceName');
        const sourceService =
          typeof sourceServiceName === 'string'
            ? services[sourceServiceName]
            : undefined;
        if (
          sourceService === undefined ||
          sourceService.models[model.modelName] !== sourceModel
        ) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.models.${modelKey} must replicate the exact source model "${String(sourceServiceName)}.${model.modelName}"`,
          );
        }
        continue;
      }
      const sourceServiceName = serviceNameBySourceModel.get(model);
      if (sourceServiceName !== undefined) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.models.${modelKey} must use makeReplica for source model "${sourceServiceName}.${model.modelName}"`,
        );
      }
    }

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
            `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName} is not a supported mutation operation`,
          );
        }
        if (operationName === 'replicateResource') {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.replicateResource belongs to the source service`,
          );
        }
        if (!Array.isArray(edges)) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName} must be an array of direct edges`,
          );
        }

        const sourceVersions = new Set<string>();
        retiredVersionsByOperation.set(operationName, sourceVersions);

        for (const [edgeIndex, edge] of edges.entries()) {
          if (typeof edge !== 'object' || edge === null) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] must be an edge object`,
            );
          }

          const source = Reflect.get(edge, 'source');
          if (!Schema.isSchema(source)) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source must be a mutation schema`,
            );
          }

          const sourceJsonSchema = Schema.toJsonSchemaDocument(source);
          const sourceProperties = Reflect.get(
            sourceJsonSchema.schema,
            'properties',
          );
          if (
            typeof sourceProperties !== 'object' ||
            sourceProperties === null
          ) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has no mutation identity`,
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
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has incomplete mutation identity`,
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
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelName is "${String(schemaSourceModelName)}"`,
            );
          }
          if (schemaSourceOperationName !== operationName) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source operationName is "${String(schemaSourceOperationName)}"`,
            );
          }
          if (typeof schemaSourceModelVersion !== 'string') {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelVersion is missing`,
            );
          }
          if (sourceVersions.has(schemaSourceModelVersion)) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName} repeats source version "${schemaSourceModelVersion}"`,
            );
          }
          sourceVersions.add(schemaSourceModelVersion);

          const sourceModel = models[sourceModelName];
          if (sourceModel !== undefined) {
            if ('sourceModel' in sourceModel) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName} belongs to its service`,
              );
            }
            if (schemaSourceModelVersion === sourceModel.version) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is current; adapter sources must be historical`,
              );
            }
            if (
              !sourceModel.historicalDefinitions.some(
                definition => definition.version === schemaSourceModelVersion,
              )
            ) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is not declared by model "${sourceModelName}"`,
              );
            }
          }

          const destination = Reflect.get(edge, 'destination');
          const adapter = Reflect.get(edge, 'adapter');
          if (destination === null) {
            if (adapter !== undefined) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] null destination must omit adapter`,
              );
            }
            continue;
          }
          if (!Schema.isSchema(destination)) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination must be a current mutation schema or null`,
            );
          }
          if (typeof adapter !== 'function') {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] non-null destination requires adapter`,
            );
          }

          const destinationJsonSchema =
            Schema.toJsonSchemaDocument(destination);
          const destinationProperties = Reflect.get(
            destinationJsonSchema.schema,
            'properties',
          );
          if (
            typeof destinationProperties !== 'object' ||
            destinationProperties === null
          ) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has no mutation identity`,
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
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has incomplete mutation identity`,
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
          const destinationModelVersion = Array.isArray(
            destinationModelVersions,
          )
            ? destinationModelVersions[0]
            : undefined;
          const destinationOperationName = Array.isArray(
            destinationOperationNames,
          )
            ? destinationOperationNames[0]
            : undefined;
          if (typeof destinationModelName !== 'string') {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination modelName is missing`,
            );
          }
          const destinationModel = models[destinationModelName];
          if (
            destinationModel === undefined ||
            'sourceModel' in destinationModel
          ) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination model "${destinationModelName}" is not an aggregate model`,
            );
          }
          if (destinationModelVersion !== destinationModel.version) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination version "${String(destinationModelVersion)}" is not current version "${destinationModel.version}"`,
            );
          }
          if (destinationOperationName !== operationName) {
            throw new Error(
              `makeSystem: aggregates.${aggregateName}.mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination operationName is "${String(destinationOperationName)}"`,
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
              `makeSystem: aggregates.${aggregateName} retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move source version`,
            );
          }
          for (const sourceVersion of createVersions) {
            if (!operationVersions.has(sourceVersion)) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName} retired model "${sourceModelName}" is missing ${requiredOperationName} adapter for source version "${sourceVersion}"`,
              );
            }
          }
        }
      }
    }

    const modelKeys = Object.keys(models);
    const selectionKeys = Object.keys(selections);
    if (modelKeys.length !== selectionKeys.length) {
      throw new Error(
        `makeSystem: aggregates.${aggregateName}.selections must contain exactly one selection for every model`,
      );
    }
    for (const modelKey of modelKeys) {
      const selection = selections[modelKey];
      if (selection === undefined || selection.model !== models[modelKey]) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.selections.${modelKey}.model must be the same object as models.${modelKey}`,
        );
      }
    }

    const queries = mapValues(queryGrants, (grant, queryKey) => {
      const queryName = String(queryKey);
      const service = services[grant.service];
      if (service === undefined) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.queries.${queryName} references missing service "${grant.service}"`,
        );
      }
      const query = service.queries[grant.query];
      if (query === undefined) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.queries.${queryName} references missing service query "${grant.service}.${grant.query}"`,
        );
      }
      if (queryName !== grant.query) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.queries.${queryName}.query must be "${queryName}", received "${grant.query}"`,
        );
      }
      return query;
    });

    const frontends = mapValues(frontendInputs, (binding, frontendKey) => {
      const frontendName = String(frontendKey);
      const {
        controller,
        models: authoredModelBindings,
        projectionAdapters = {},
        contractAdapters = {},
      } = binding;

      if (controller.kind !== 'aggregate') {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.controller must be aggregate-owned`,
        );
      }
      if (controller.systemName !== name) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.controller must have systemName "${name}", received "${controller.systemName}"`,
        );
      }
      if (controller.aggregateName !== aggregateName) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.controller must have aggregateName "${aggregateName}", received "${controller.aggregateName}"`,
        );
      }
      if (controller.frontendName !== frontendName) {
        throw new Error(
          `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.controller must have frontendName "${frontendName}", received "${controller.frontendName}"`,
        );
      }
      const resolvedModelBindings: Record<string, string> = {};
      if (authoredModelBindings === undefined) {
        for (const modelKey of Object.keys(controller.models)) {
          if (models[modelKey] !== undefined) {
            resolvedModelBindings[modelKey] = modelKey;
          }
        }
      } else {
        Object.assign(resolvedModelBindings, authoredModelBindings);
      }

      const bindingModels: Record<string, IModel> = {};
      const usedSourceModelKeys = new Set<string>();
      for (const [frontendModelKey, sourceModelKey] of Object.entries(
        resolvedModelBindings,
      )) {
        const frontendModel = controller.models[frontendModelKey];
        if (frontendModel === undefined) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.models.${frontendModelKey} is not a frontend model`,
          );
        }
        const sourceModel = models[sourceModelKey];
        if (sourceModel === undefined) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.models.${frontendModelKey} references missing aggregate model "${sourceModelKey}"`,
          );
        }
        if (usedSourceModelKeys.has(sourceModelKey)) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.models must not bind aggregate model "${sourceModelKey}" more than once`,
          );
        }
        usedSourceModelKeys.add(sourceModelKey);
        bindingModels[frontendModelKey] = sourceModel;
      }

      for (const [frontendModelKey, sourceModel] of Object.entries(
        bindingModels,
      )) {
        const frontendModel = controller.models[frontendModelKey];
        if (frontendModel === undefined) {
          continue;
        }
        const diverges = sourceModel.modelName !== frontendModel.modelName;
        const hasAdapter = frontendModelKey in projectionAdapters;
        if (!diverges && !isEqual(sourceModel.spec, frontendModel.spec)) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.models.${frontendModelKey} must exactly match aggregate model "${sourceModel.modelName}" when no projection adapter is allowed`,
          );
        }
        if (diverges && !hasAdapter) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.projectionAdapters.${frontendModelKey} is required when source modelName "${sourceModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`,
          );
        }
        if (!diverges && hasAdapter) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.projectionAdapters.${frontendModelKey} must not be set when source and frontend modelName both equal "${frontendModel.modelName}"`,
          );
        }
      }

      for (const adapterKey of Object.keys(projectionAdapters)) {
        if (bindingModels[adapterKey] === undefined) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.projectionAdapters.${adapterKey} has no matching binding model`,
          );
        }
      }

      for (const [commandName, guards] of Object.entries(controller.guards)) {
        for (const [guardIndex, guard] of guards.entries()) {
          for (const [guardModelKey, guardModel] of Object.entries(
            guard.models,
          )) {
            if (controller.models[guardModelKey] !== guardModel) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.guards.${commandName}.${guardIndex}.models.${guardModelKey} must be the same object as controller.models.${guardModelKey}`,
              );
            }
            if (bindingModels[guardModelKey] !== guardModel) {
              throw new Error(
                `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.guards.${commandName}.${guardIndex}.models.${guardModelKey} must be identity-bound to authoritative aggregate model "${guardModel.modelName}"`,
              );
            }
          }
        }
      }

      const resolvedContracts: Record<string, IContract> = {};
      const resolvedContractAdapters: Record<string, unknown> = {};
      for (const [contractKey, frontendContract] of Object.entries(
        controller.contracts,
      )) {
        const override = contractAdapters[contractKey];
        if (override === undefined) {
          resolvedContracts[contractKey] = frontendContract;
          resolvedContractAdapters[contractKey] = identityContractAdapt;
        } else {
          resolvedContracts[contractKey] = override.contract;
          resolvedContractAdapters[contractKey] = override.adapt;
        }

        if (contracts[contractKey] !== resolvedContracts[contractKey]) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.contracts.${contractKey} must be the same authoritative contract resolved by frontends.${frontendName}`,
          );
        }
      }

      for (const adapterKey of Object.keys(contractAdapters)) {
        if (controller.contracts[adapterKey] === undefined) {
          throw new Error(
            `makeSystem: aggregates.${aggregateName}.frontends.${frontendName}.contractAdapters.${adapterKey} is not a frontend contract`,
          );
        }
      }

      return {
        name: frontendName,
        controller,
        models: bindingModels,
        contracts: resolvedContracts,
        projectionAdapters,
        contractAdapters: resolvedContractAdapters,
      };
    });

    const makeCommand = <
      CONTRACT_NAME extends keyof typeof contracts & string,
    >(commandProps: {
      contractName: CONTRACT_NAME;
      aggregateId: IAggregateId;
      systemName: string;
      payload: InferPayloadInput<(typeof contracts)[CONTRACT_NAME]['payload']>;
    }) => {
      return Effect.gen(function* () {
        const { contractName, ...aggregateCommandProps } = commandProps;
        const contract = yield* getByKeyOrThrow({
          record: contracts,
          key: contractName,
          recordKind: `makeSystem: aggregates.${aggregateName}.contracts`,
        });
        return yield* makeAggregateCommand({
          contract,
          aggregateName,
          ...aggregateCommandProps,
        });
      });
    };

    const resolvedAggregate = {
      name: aggregateName,
      models,
      contracts,
      mutationAdapters,
      selections,
      queries,
      frontends,
      makeCommand,
    };
    return hasFrontends
      ? { ...resolvedAggregate, authorize }
      : resolvedAggregate;
  });

  return {
    name,
    version,
    authentication,
    aggregates,
    services,
  };
}
