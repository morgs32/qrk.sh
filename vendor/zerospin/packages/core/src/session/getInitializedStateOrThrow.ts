import { ZerospinError } from '@zerospin/error';

import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';

import type { IAggregateSession, IInitializedSessionState } from './types.ts';

export function getInitializedStateOrThrow<
  FRONTEND extends IAggregateFrontendController,
>(props: {
  session: IAggregateSession<FRONTEND>;
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
