import type { Context } from 'react';

import type { Async } from '@zerospin/core/async/Async';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import type {
  IModel,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type {
  IInitializedServiceSessionState,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
import type {
  IInitializedSessionState,
  ISession,
} from '@zerospin/core/session/types';
import type { IAnyError } from '@zerospin/error';
import type { authenticate } from '@zerospin/frontend/authenticate';
import type { Effect, Layer, ManagedRuntime, Schema } from 'effect';

import type { IBrowserPartitionController } from './makeBrowserPartitionController';
import type { makeProvider } from './makeProvider';
import type { makeServiceProvider } from './makeServiceProvider';

export type IBrowserSession<
  FRONTEND extends IFrontendController = IFrontendController,
> = Omit<ISession<FRONTEND>, 'generateSignature'> & {
  browserPartitionController: IBrowserPartitionController;
  coreSession: ISession<FRONTEND>;
};

export type IReactSessionContext<FRONTEND extends IFrontendController> = {
  session: IBrowserSession<FRONTEND>;
};

export type ISessionProviderBaseServices =
  | Async
  | CuidFactory
  | MonotonicFactory
  | PublishableKey
  | ZerospinApisUrl;

export type ISessionProviderServices = ISessionProviderBaseServices;

export type ISessionProviderLayer = Layer.Layer<
  ISessionProviderBaseServices,
  IAnyError,
  never
>;

export type ISessionProviderRuntime = ManagedRuntime.ManagedRuntime<
  ISessionProviderServices,
  IAnyError
>;

export type IReactFrontend<FRONTEND extends IFrontendController> = {
  kind: 'account';
  frontend: FRONTEND;
  authenticate: (
    signature: Schema.Schema.Type<FRONTEND['signature']>,
  ) => Promise<
    Effect.Effect.Success<ReturnType<typeof authenticate<FRONTEND>>>
  >;
  Provider: ReturnType<typeof makeProvider<FRONTEND>>;
  ReactContext: Context<IReactSessionContext<FRONTEND> | null>;
  useCtxOrThrow: () => IReactSessionContext<FRONTEND>;
  makeId: <MODEL extends IModel>(
    model: MODEL,
  ) => InferIdFromAbbreviation<MODEL['abbreviation']>;
  makeModelId: <MODEL extends IModel>(
    model: MODEL,
  ) => InferIdFromAbbreviation<MODEL['abbreviation']>;
  useInitializedStateOrThrow: () => IInitializedSessionState<
    InferFrontendModels<FRONTEND>
  >;
  sync: ISessionProviderRuntime['runSync'];
  sessionRuntime: ISessionProviderRuntime;
};

export type IBrowserServiceSession<
  FRONTEND extends IServiceFrontendController = IServiceFrontendController,
> = IServiceSession<FRONTEND> & {
  browserPartitionController: IBrowserPartitionController;
  coreSession: IServiceSession<FRONTEND>;
};

export type IReactServiceSessionContext<
  FRONTEND extends IServiceFrontendController,
> = {
  session: IBrowserServiceSession<FRONTEND>;
};

export type IReactServiceFrontend<FRONTEND extends IServiceFrontendController> =
  {
    kind: 'service';
    frontend: FRONTEND;
    Provider: ReturnType<typeof makeServiceProvider<FRONTEND>>;
    ReactContext: Context<IReactServiceSessionContext<FRONTEND> | null>;
    useCtxOrThrow: () => IReactServiceSessionContext<FRONTEND>;
    makeId: <MODEL extends IModel>(
      model: MODEL,
    ) => InferIdFromAbbreviation<MODEL['abbreviation']>;
    makeModelId: <MODEL extends IModel>(
      model: MODEL,
    ) => InferIdFromAbbreviation<MODEL['abbreviation']>;
    useInitializedStateOrThrow: () => IInitializedServiceSessionState<
      FRONTEND['models']
    >;
    sync: ISessionProviderRuntime['runSync'];
    sessionRuntime: ISessionProviderRuntime;
  };
