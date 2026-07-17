import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IContractAdapterEntry } from '../contracts/makeContractAdapter.ts';
import type {
  IActorCommand,
  ICommand,
  IContract,
  IContracts,
} from '../contracts/types.ts';
import type { IFrontendController } from '../frontendController/types.ts';
import type { IGuards } from '../guards/types.ts';
import type {
  IModel,
  IModels,
  InferCommandPayload,
  InferPayloadInput,
  InferResource,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { IAnyAuthentication, IAuthenticate } from '../system/types.ts';

type IFrontendControllerBindingSource = Pick<
  IFrontendController,
  | 'accountName'
  | 'actorName'
  | 'frontendName'
  | 'version'
  | 'contracts'
  | 'systemName'
  | 'models'
  | 'signature'
>;

type IBindingModels<
  FRONTEND_MODELS extends IModels,
  ACTOR_MODELS extends IModels,
> = Pick<ACTOR_MODELS, keyof ACTOR_MODELS & keyof FRONTEND_MODELS>;

type IModelAdapter<
  ACTOR_MODEL extends IModel,
  FRONTEND_MODEL extends IModel,
> = (
  actorResource: InferResource<ACTOR_MODEL>,
) => Effect.Effect<InferResource<FRONTEND_MODEL>, IAnyError>;

type IModelAdapterRequiredKeys<
  FRONTEND_MODELS extends IModels,
  ACTOR_MODELS extends IModels,
> = {
  [K in keyof FRONTEND_MODELS &
    keyof ACTOR_MODELS &
    string]: FRONTEND_MODELS[K] extends {
    modelName: infer FRONTEND_NAME extends string;
  }
    ? ACTOR_MODELS[K] extends { modelName: infer ACTOR_NAME extends string }
      ? FRONTEND_NAME extends ACTOR_NAME
        ? ACTOR_NAME extends FRONTEND_NAME
          ? never
          : K
        : K
      : K
    : never;
}[keyof FRONTEND_MODELS & keyof ACTOR_MODELS & string];

type IModelAdapterForbiddenKeys<
  FRONTEND_MODELS extends IModels,
  ACTOR_MODELS extends IModels,
> = {
  [K in keyof FRONTEND_MODELS &
    keyof ACTOR_MODELS &
    string]: FRONTEND_MODELS[K] extends {
    modelName: infer FRONTEND_NAME extends string;
  }
    ? ACTOR_MODELS[K] extends { modelName: infer ACTOR_NAME extends string }
      ? FRONTEND_NAME extends ACTOR_NAME
        ? ACTOR_NAME extends FRONTEND_NAME
          ? K
          : never
        : never
      : never
    : never;
}[keyof FRONTEND_MODELS & keyof ACTOR_MODELS & string];

export type IModelAdapters<
  FRONTEND_MODELS extends IModels,
  ACTOR_MODELS extends IModels,
> = {
  [K in IModelAdapterRequiredKeys<
    FRONTEND_MODELS,
    ACTOR_MODELS
  >]: IModelAdapter<ACTOR_MODELS[K], FRONTEND_MODELS[K]>;
} & {
  [K in IModelAdapterForbiddenKeys<FRONTEND_MODELS, ACTOR_MODELS>]?: never;
};

export type IContractAdapters<FRONTEND_CONTRACTS extends IContracts> = Partial<{
  [K in keyof FRONTEND_CONTRACTS & string]: IContractAdapterEntry<
    FRONTEND_CONTRACTS[K],
    IContract
  >;
}>;

type IResolvedContracts<
  FRONTEND_CONTRACTS extends IContracts,
  CONTRACT_ADAPTERS extends IContractAdapters<FRONTEND_CONTRACTS>,
> = {
  [K in keyof FRONTEND_CONTRACTS]: K extends keyof CONTRACT_ADAPTERS
    ? CONTRACT_ADAPTERS[K] extends IContractAdapterEntry<
        FRONTEND_CONTRACTS[K],
        infer ACTOR_CONTRACT
      >
      ? ACTOR_CONTRACT
      : FRONTEND_CONTRACTS[K]
    : FRONTEND_CONTRACTS[K];
};

export type IFrontendBindingProps<
  ACTOR_MODELS extends IModels = IModels,
  FRONTEND_CONTROLLER extends IFrontendControllerBindingSource =
    IFrontendControllerBindingSource,
  CONTRACT_ADAPTERS extends IContractAdapters<
    FRONTEND_CONTROLLER['contracts']
  > = {},
> = {
  frontendController: FRONTEND_CONTROLLER;
  authenticate: IAuthenticate<
    IBindingModels<FRONTEND_CONTROLLER['models'], ACTOR_MODELS>,
    keyof IBindingModels<FRONTEND_CONTROLLER['models'], ACTOR_MODELS> & string,
    keyof IBindingModels<FRONTEND_CONTROLLER['models'], ACTOR_MODELS> & string,
    FRONTEND_CONTROLLER['signature'],
    IResolvedContracts<FRONTEND_CONTROLLER['contracts'], CONTRACT_ADAPTERS>
  >;
  modelAdapters?: IModelAdapters<FRONTEND_CONTROLLER['models'], ACTOR_MODELS>;
  contractAdapters?: CONTRACT_ADAPTERS;
};

export type IFrontendBinding<
  NAME extends string = string,
  ACTOR_MODELS extends IModels = IModels,
  FRONTEND_CONTROLLER extends IFrontendControllerBindingSource =
    IFrontendControllerBindingSource,
  CONTRACT_ADAPTERS extends IContractAdapters<
    FRONTEND_CONTROLLER['contracts']
  > = {},
> = {
  name: NAME;
  frontendController: FRONTEND_CONTROLLER;
  models: IBindingModels<FRONTEND_CONTROLLER['models'], ACTOR_MODELS>;
  contracts: IResolvedContracts<
    FRONTEND_CONTROLLER['contracts'],
    CONTRACT_ADAPTERS
  >;
  modelAdapters: IModelAdapters<FRONTEND_CONTROLLER['models'], ACTOR_MODELS>;
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
  authenticate: IFrontendBindingProps<
    ACTOR_MODELS,
    FRONTEND_CONTROLLER,
    CONTRACT_ADAPTERS
  >['authenticate'];
  makeCommand: <
    CONTRACT_NAME extends keyof IResolvedContracts<
      FRONTEND_CONTROLLER['contracts'],
      CONTRACT_ADAPTERS
    > &
      string,
  >(props: {
    contractName: CONTRACT_NAME;
    accountId: string;
    actorId: string;
    systemVersion: string;
    payload: InferPayloadInput<
      IResolvedContracts<
        FRONTEND_CONTROLLER['contracts'],
        CONTRACT_ADAPTERS
      >[CONTRACT_NAME]['payload']
    >;
  }) => Effect.Effect<
    IActorCommand<
      ICommand<
        IResolvedContracts<
          FRONTEND_CONTROLLER['contracts'],
          CONTRACT_ADAPTERS
        >[CONTRACT_NAME]['commandName'],
        IResolvedContracts<
          FRONTEND_CONTROLLER['contracts'],
          CONTRACT_ADAPTERS
        >[CONTRACT_NAME]['version'],
        InferCommandPayload<
          IResolvedContracts<
            FRONTEND_CONTROLLER['contracts'],
            CONTRACT_ADAPTERS
          >[CONTRACT_NAME]['payload']
        >
      >
    >,
    IAnyError,
    CuidFactory
  >;
};

type IAnyFrontendController = {
  accountName: string;
  actorName: string;
  frontendName: string;
  version: string;
  contracts: IContracts;
  systemName: string;
  models: IModels;
  modelNames: readonly string[];
  guards: IGuards<IContracts>;
  signature: Schema.Schema.AnyNoContext;
};

export type IAnyFrontendBindingProps = {
  frontendController: IAnyFrontendController;
  modelAdapters?: Record<string, unknown>;
  contractAdapters?: Record<string, IContractAdapterEntry>;
  authenticate: IAnyAuthentication['authenticate'];
};

/** Erased frontend binding stored on heterogeneous actor maps. */
export type IAnyFrontendBinding = {
  name: string;
  frontendController: IAnyFrontendController;
  models: IModels;
  contracts: IContracts;
  modelAdapters: Record<string, unknown>;
  contractAdapters: Record<
    string,
    {
      bivarianceHack(props: {
        contract: IContract;
        payload: unknown;
      }): Effect.Effect<unknown, IAnyError>;
    }['bivarianceHack']
  >;
  authenticate: IAnyAuthentication['authenticate'];
};
