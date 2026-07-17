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
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type {
  IInitializedSessionState,
  ISession,
} from '@zerospin/core/session/types';
import type { IAnyError } from '@zerospin/error';
import type { Layer, ManagedRuntime } from 'effect';

import type { IBrowserUserController } from './makeBrowserUserController';
import type { makeProvider } from './makeProvider';

export type IBrowserSession<
  FRONTEND extends IFrontendController = IFrontendController,
> = ISession<FRONTEND> & {
  browserUserController: IBrowserUserController;
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
  frontend: FRONTEND;
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
