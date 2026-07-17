import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import type { IInitializedSessionState } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { useStore } from 'zustand/react';

import type { IReactFrontend } from './types';
import { useCtxOrThrow } from './useCtxOrThrow';

export function useInitializedStateOrThrow<
  FRONTEND extends IFrontendController,
>(
  reactFrontend: Pick<IReactFrontend<FRONTEND>, 'ReactContext'>,
): IInitializedSessionState<InferFrontendModels<FRONTEND>> {
  const { session } = useCtxOrThrow(reactFrontend);
  return useStore(session.store, state => {
    if (!state.isInitialized || state.db === null || state.schema === null) {
      throw new ZerospinError({
        code: 'session-store-not-initialized',
        message: 'Session store is not initialized',
      });
    }
    return state;
  });
}
