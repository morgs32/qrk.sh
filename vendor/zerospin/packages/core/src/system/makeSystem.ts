/* oxlint-disable typescript/no-explicit-any -- complete resolved definitions span model-specific resource shapes */
import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import type { Effect, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IAggregate } from '../aggregate/types.ts';
import type { IAuthenticationSignature } from '../authentication/types.ts';
import type { IContractAdapterEntry } from '../contracts/makeContractAdapter.ts';
import type {
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
import type { ISelectionWhereProps } from '../models/makeSelection.ts';
import type {
  IAssertValidModels,
  IModel,
  IModelReplica,
  IModels,
} from '../models/types.ts';
import type {
  IResolvedServiceQuery,
  IService,
  IServiceQuery,
} from '../service/types.ts';

import { decodeSystemProps } from './decodeSystemProps.ts';
import { resolveSystemAggregate } from './resolveSystemAggregate.ts';
import { resolveSystemService } from './resolveSystemService.ts';
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
  const decoded = decodeSystemProps(props);
  const serviceNameBySourceModel = new Map();
  const services = mapValues(decoded.services, (service, serviceKey) =>
    resolveSystemService({
      name: decoded.name,
      serviceName: String(serviceKey),
      service,
      serviceNameBySourceModel,
    }),
  );
  const aggregates = mapValues(decoded.aggregates, (aggregate, aggregateKey) =>
    resolveSystemAggregate({
      name: decoded.name,
      aggregateName: String(aggregateKey),
      aggregate,
      services,
      serviceNameBySourceModel,
    }),
  );
  return {
    name: decoded.name,
    version: decoded.version,
    authentication: decoded.authentication,
    aggregates,
    services,
  };
}
