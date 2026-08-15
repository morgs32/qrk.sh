import { useContext, useSyncExternalStore } from 'react';

import type {
  IAggregateFrontendController,
  IFrontendController,
  InferFrontendModels,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { IInitializedServiceSessionState } from '@zerospin/core/serviceSession/types';
import type { IInitializedSessionState } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';

import { ZerospinProviderContext } from './ZerospinProviderContext';

export function useInitializedStateOrThrow<
  FRONTEND extends IAggregateFrontendController,
>(
  selector: Readonly<{ frontend: FRONTEND }>,
): IInitializedSessionState<InferFrontendModels<FRONTEND>>;
export function useInitializedStateOrThrow<
  FRONTEND extends IServiceFrontendController,
>(
  selector: Readonly<{ frontend: FRONTEND }>,
): IInitializedServiceSessionState<FRONTEND['models']>;
export function useInitializedStateOrThrow(
  selector: Readonly<{
    frontend: IFrontendController | IServiceFrontendController;
  }>,
): object {
  const provider = useContext(ZerospinProviderContext);
  if (provider === null) {
    throw new Error(
      'useInitializedStateOrThrow must be used within ZerospinApp.Provider.',
    );
  }
  const entry = provider.sessions.get(selector);
  if (entry === undefined) {
    throw new Error(
      `ZerospinApp.Provider has no mounted session for frontend "${selector.frontend.frontendName}". Use the matching ZerospinApp.frontends entry.`,
    );
  }
  const state = useSyncExternalStore(
    entry.subscribe,
    entry.getState,
    entry.getState,
  );
  if (
    !('isInitialized' in state) ||
    state.isInitialized !== true ||
    !('db' in state) ||
    state.db === null ||
    !('schema' in state) ||
    state.schema === null
  ) {
    throw new ZerospinError({
      code:
        'serviceName' in selector.frontend
          ? 'service-session-store-not-initialized'
          : 'session-store-not-initialized',
      message:
        'serviceName' in selector.frontend
          ? 'Service session store is not initialized'
          : 'Session store is not initialized',
    });
  }
  return state;
}
