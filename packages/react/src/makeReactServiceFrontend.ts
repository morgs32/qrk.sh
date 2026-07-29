import { createContext, useContext } from 'react';

import type {
  IModel,
  InferIdFromAbbreviation,
} from '@zerospin/core/models/types';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import type { IInitializedServiceSessionState } from '@zerospin/core/serviceSession/types';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { ManagedRuntime, type Layer } from 'effect';
import { useStore } from 'zustand/react';

import { sessionProviderDefaultLayer } from './makeReactFrontend';
import { makeServiceProvider } from './makeServiceProvider';
import type {
  IReactServiceFrontend,
  IReactServiceSessionContext,
  ISessionProviderRuntime,
  ISessionProviderServices,
} from './types';

export function makeReactServiceFrontend<
  FRONTEND extends IServiceFrontendController,
>(props: {
  frontend: FRONTEND;
  runtime?: ISessionProviderRuntime;
}): IReactServiceFrontend<FRONTEND> {
  const { frontend } = props;
  const sessionRuntime =
    props.runtime ??
    ManagedRuntime.make(
      sessionProviderDefaultLayer satisfies Layer.Layer<
        ISessionProviderServices,
        IAnyError,
        never
      >,
    );
  const ReactContext =
    createContext<IReactServiceSessionContext<FRONTEND> | null>(null);
  const Provider = makeServiceProvider({
    ReactContext,
    sessionRuntime,
    frontend,
  });
  const sync = sessionRuntime.runSync.bind(sessionRuntime);

  function makeId<MODEL extends IModel>(
    model: MODEL,
  ): InferIdFromAbbreviation<MODEL['abbreviation']> {
    return sync(makeIdFromAbbreviation({ abbreviation: model.abbreviation }));
  }

  function useCtxOrThrow(): IReactServiceSessionContext<FRONTEND> {
    const context = useContext(ReactContext);
    if (context === null) {
      throw new Error(
        'useCtxOrThrow must be used within a <ServiceFrontend>.Provider',
      );
    }
    return context;
  }

  function useInitializedStateOrThrow(): IInitializedServiceSessionState<
    FRONTEND['models']
  > {
    const { session } = useCtxOrThrow();
    return useStore(session.store, state => {
      if (!state.isInitialized || state.db === null || state.schema === null) {
        throw new ZerospinError({
          code: 'service-session-store-not-initialized',
          message: 'Service session store is not initialized',
        });
      }
      return state;
    });
  }

  return {
    kind: 'service',
    frontend,
    Provider,
    ReactContext,
    useCtxOrThrow,
    makeId,
    makeModelId: makeId,
    useInitializedStateOrThrow,
    sync,
    sessionRuntime,
  };
}
