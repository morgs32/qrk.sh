import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IContractAdapterEntry } from '../contracts/makeContractAdapter.ts';
import type { IContract, IContracts } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyAggregateFrontendController,
  IAnyServiceFrontendController,
} from '../frontendController/types.ts';
import type {
  IAggregateId,
  IModel,
  IModels,
  InferCommandPayload,
  InferResource,
} from '../models/types.ts';

export type IFrontendModelBindings<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
> = Partial<{
  [K in keyof FRONTEND_MODELS & string]: keyof SOURCE_MODELS & string;
}>;

type IDefaultFrontendModelBindings<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
> = {
  [K in keyof FRONTEND_MODELS & keyof SOURCE_MODELS & string]: K;
};

type IResolvedFrontendModelBindings<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
    | undefined,
> = [MODEL_BINDINGS] extends [undefined]
  ? IDefaultFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
  : MODEL_BINDINGS;

export type IResolvedFrontendModels<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
    | undefined,
> = {
  [K in keyof IResolvedFrontendModelBindings<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  > &
    keyof FRONTEND_MODELS]: IResolvedFrontendModelBindings<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  >[K] extends keyof SOURCE_MODELS
    ? SOURCE_MODELS[IResolvedFrontendModelBindings<
        FRONTEND_MODELS,
        SOURCE_MODELS,
        MODEL_BINDINGS
      >[K]]
    : never;
};

type IProjectionAdapter<
  SOURCE_MODEL extends IModel,
  FRONTEND_MODEL extends IModel,
> = (
  sourceResource: InferResource<SOURCE_MODEL>,
) => Effect.Effect<InferResource<FRONTEND_MODEL>, IAnyError>;

type IProjectionAdapterRequiredKeys<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
    | undefined,
> = {
  [K in keyof IResolvedFrontendModels<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  > &
    keyof FRONTEND_MODELS &
    string]: FRONTEND_MODELS[K] extends {
    modelName: infer FRONTEND_NAME extends string;
  }
    ? IResolvedFrontendModels<
        FRONTEND_MODELS,
        SOURCE_MODELS,
        MODEL_BINDINGS
      >[K] extends {
        modelName: infer SOURCE_NAME extends string;
      }
      ? FRONTEND_NAME extends SOURCE_NAME
        ? SOURCE_NAME extends FRONTEND_NAME
          ? never
          : K
        : K
      : K
    : never;
}[keyof IResolvedFrontendModels<
  FRONTEND_MODELS,
  SOURCE_MODELS,
  MODEL_BINDINGS
> &
  keyof FRONTEND_MODELS &
  string];

type IProjectionAdapterForbiddenKeys<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
    | undefined,
> = {
  [K in keyof IResolvedFrontendModels<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  > &
    keyof FRONTEND_MODELS &
    string]: FRONTEND_MODELS[K] extends {
    modelName: infer FRONTEND_NAME extends string;
  }
    ? IResolvedFrontendModels<
        FRONTEND_MODELS,
        SOURCE_MODELS,
        MODEL_BINDINGS
      >[K] extends {
        modelName: infer SOURCE_NAME extends string;
      }
      ? FRONTEND_NAME extends SOURCE_NAME
        ? SOURCE_NAME extends FRONTEND_NAME
          ? K
          : never
        : never
      : never
    : never;
}[keyof IResolvedFrontendModels<
  FRONTEND_MODELS,
  SOURCE_MODELS,
  MODEL_BINDINGS
> &
  keyof FRONTEND_MODELS &
  string];

export type IProjectionAdapters<
  FRONTEND_MODELS extends IModels,
  SOURCE_MODELS extends IModels,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_MODELS, SOURCE_MODELS>
    | undefined = undefined,
> = {
  [K in IProjectionAdapterRequiredKeys<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  >]: IProjectionAdapter<
    IResolvedFrontendModels<FRONTEND_MODELS, SOURCE_MODELS, MODEL_BINDINGS>[K],
    FRONTEND_MODELS[K]
  >;
} & {
  [K in IProjectionAdapterForbiddenKeys<
    FRONTEND_MODELS,
    SOURCE_MODELS,
    MODEL_BINDINGS
  >]?: never;
};

export type IContractAdapters<FRONTEND_CONTRACTS extends IContracts> = Partial<{
  [K in keyof FRONTEND_CONTRACTS & string]: IContractAdapterEntry<
    FRONTEND_CONTRACTS[K],
    IContract
  >;
}>;

export type IResolvedContracts<
  FRONTEND_CONTRACTS extends IContracts,
  CONTRACT_ADAPTERS extends IContractAdapters<FRONTEND_CONTRACTS>,
> = {
  [K in keyof FRONTEND_CONTRACTS]: K extends keyof CONTRACT_ADAPTERS
    ? CONTRACT_ADAPTERS[K] extends IContractAdapterEntry<
        FRONTEND_CONTRACTS[K],
        infer AGGREGATE_CONTRACT
      >
      ? AGGREGATE_CONTRACT
      : FRONTEND_CONTRACTS[K]
    : FRONTEND_CONTRACTS[K];
};

export type IAggregateAuthorization<
  FRONTENDS extends Record<string, IAnyAggregateFrontendBinding>,
  MODELS extends IModels,
  AUTHORIZATION_CONTEXT = never,
> = (
  props: {
    [FRONTEND_NAME in keyof FRONTENDS & string]: {
      frontendName: FRONTEND_NAME;
      userId: string;
      aggregateId: IAggregateId;
      db: Readonly<
        Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
      >;
    };
  }[keyof FRONTENDS & string],
) => Effect.Effect<void, IAnyError, AUTHORIZATION_CONTEXT>;

export type IServiceAuthorization<
  FRONTENDS extends Record<string, IAnyServiceFrontendBinding>,
  MODELS extends IModels,
  AUTHORIZATION_CONTEXT = never,
> = (
  props: {
    [FRONTEND_NAME in keyof FRONTENDS & string]: {
      frontendName: FRONTEND_NAME;
      userId: string;
      db: Readonly<
        Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
      >;
    };
  }[keyof FRONTENDS & string],
) => Effect.Effect<void, IAnyError, AUTHORIZATION_CONTEXT>;

export type IAggregateFrontendBindingProps<
  AGGREGATE_MODELS extends IModels,
  FRONTEND_CONTROLLER extends IAnyAggregateFrontendController,
  CONTRACT_ADAPTERS extends IContractAdapters<
    FRONTEND_CONTROLLER['contracts']
  > = {},
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_CONTROLLER['models'], AGGREGATE_MODELS>
    | undefined = undefined,
> = {
  controller: FRONTEND_CONTROLLER;
  models?: MODEL_BINDINGS;
  projectionAdapters?: IProjectionAdapters<
    FRONTEND_CONTROLLER['models'],
    AGGREGATE_MODELS,
    MODEL_BINDINGS
  >;
  contractAdapters?: CONTRACT_ADAPTERS;
};

export type IAggregateFrontendBinding<
  NAME extends string = string,
  AGGREGATE_MODELS extends IModels = IModels,
  FRONTEND_CONTROLLER extends IAnyAggregateFrontendController =
    IAnyAggregateFrontendController,
  CONTRACT_ADAPTERS extends IContractAdapters<
    FRONTEND_CONTROLLER['contracts']
  > = {},
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_CONTROLLER['models'], AGGREGATE_MODELS>
    | undefined = undefined,
> = {
  name: NAME;
  controller: FRONTEND_CONTROLLER;
  models: IResolvedFrontendModels<
    FRONTEND_CONTROLLER['models'],
    AGGREGATE_MODELS,
    MODEL_BINDINGS
  >;
  contracts: IResolvedContracts<
    FRONTEND_CONTROLLER['contracts'],
    CONTRACT_ADAPTERS
  >;
  projectionAdapters: IProjectionAdapters<
    FRONTEND_CONTROLLER['models'],
    AGGREGATE_MODELS,
    MODEL_BINDINGS
  >;
  contractAdapters: {
    [K in keyof FRONTEND_CONTROLLER['contracts']]: (props: {
      contract: FRONTEND_CONTROLLER['contracts'][K];
      payload: InferCommandPayload<
        FRONTEND_CONTROLLER['contracts'][K]['payload']
      >;
    }) => Effect.Effect<
      InferCommandPayload<
        IResolvedContracts<
          FRONTEND_CONTROLLER['contracts'],
          CONTRACT_ADAPTERS
        >[K]['payload']
      >,
      IAnyError
    >;
  };
};

export type IServiceFrontendBindingProps<
  SERVICE_MODELS extends IModels,
  FRONTEND_CONTROLLER extends IAnyServiceFrontendController,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_CONTROLLER['models'], SERVICE_MODELS>
    | undefined = undefined,
> = {
  controller: FRONTEND_CONTROLLER;
  models?: MODEL_BINDINGS;
  projectionAdapters?: IProjectionAdapters<
    FRONTEND_CONTROLLER['models'],
    SERVICE_MODELS,
    MODEL_BINDINGS
  >;
};

export type IServiceFrontendBinding<
  NAME extends string = string,
  SERVICE_MODELS extends IModels = IModels,
  FRONTEND_CONTROLLER extends IAnyServiceFrontendController =
    IAnyServiceFrontendController,
  MODEL_BINDINGS extends
    | IFrontendModelBindings<FRONTEND_CONTROLLER['models'], SERVICE_MODELS>
    | undefined = undefined,
> = {
  name: NAME;
  controller: FRONTEND_CONTROLLER;
  models: IResolvedFrontendModels<
    FRONTEND_CONTROLLER['models'],
    SERVICE_MODELS,
    MODEL_BINDINGS
  >;
  projectionAdapters: IProjectionAdapters<
    FRONTEND_CONTROLLER['models'],
    SERVICE_MODELS,
    MODEL_BINDINGS
  >;
};

export type IAnyAggregateFrontendBindingProps = {
  controller: IAnyAggregateFrontendController;
  models?: Record<string, string>;
  projectionAdapters?: Record<string, unknown>;
  contractAdapters?: Record<string, IContractAdapterEntry>;
};

export type IAnyServiceFrontendBindingProps = {
  controller: IAnyServiceFrontendController;
  models?: Record<string, string>;
  projectionAdapters?: Record<string, unknown>;
};

export type IAnyAggregateFrontendBinding = {
  name: string;
  controller: IAnyAggregateFrontendController;
  models: IModels;
  contracts: IContracts;
  projectionAdapters: Partial<
    Record<
      string,
      {
        bivarianceHack(
          sourceResource: unknown,
        ): Effect.Effect<unknown, IAnyError>;
      }['bivarianceHack']
    >
  >;
  contractAdapters: Partial<
    Record<
      string,
      {
        bivarianceHack(props: {
          contract: IContract;
          payload: unknown;
        }): Effect.Effect<unknown, IAnyError>;
      }['bivarianceHack']
    >
  >;
};

export type IAnyServiceFrontendBinding = {
  name: string;
  controller: IAnyServiceFrontendController;
  models: IModels;
  projectionAdapters: Partial<
    Record<
      string,
      {
        bivarianceHack(
          sourceResource: unknown,
        ): Effect.Effect<unknown, IAnyError>;
      }['bivarianceHack']
    >
  >;
};
