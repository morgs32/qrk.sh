import { makeZerospinError } from '@zerospin/error';

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  IInitializedSessionState,
} from './types.ts';

export function getInitializedStateOrThrow<
  DEFINITION extends IAggregateSessionDefinition,
>(props: {
  session: IAggregateSession<DEFINITION>;
}): IInitializedSessionState<DEFINITION['models']> {
  const { session } = props;
  const state = session.store.getState();
  if (!state.isInitialized || state.db === null || state.schema === null) {
    throw makeZerospinError({
      code: 'session-store-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  return state;
}
