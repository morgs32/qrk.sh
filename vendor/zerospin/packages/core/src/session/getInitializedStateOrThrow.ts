import { ZerospinError } from '@zerospin/error';

import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';

import type { IInitializedSessionState, ISession } from './types.ts';

export function getInitializedStateOrThrow<
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
}): IInitializedSessionState<InferFrontendModels<FRONTEND>> {
  const { session } = props;
  const state = session.store.getState();
  if (!state.isInitialized || state.db === null || state.schema === null) {
    throw new ZerospinError({
      code: 'session-store-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  return state;
}
