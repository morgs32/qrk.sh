'use client';

import { useSyncExternalStore } from 'react';

import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { makeZerospinError } from '@zerospin/error';

/**
 * Returns the published session identity. Throws while the store is
 * still unpublished — mount only under an initialized gate such as
 * useInitializeSession.
 */
export function useIdentity<DEFINITION extends IAggregateSessionDefinition>(
  session: IAggregateSession<DEFINITION>,
): DEFINITION['identity']['identitySchema']['Type'];

export function useIdentity<DEFINITION extends IServiceSessionDefinition>(
  session: IServiceSession<DEFINITION>,
): DEFINITION['identity']['identitySchema']['Type'];

export function useIdentity(session: {
  store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => {
      isInitialized: boolean;
      identity: unknown;
    };
  };
}): unknown {
  const identity = useSyncExternalStore(
    session.store.subscribe,
    () => {
      const state = session.store.getState();
      return state.isInitialized ? state.identity : null;
    },
    () => {
      const state = session.store.getState();
      return state.isInitialized ? state.identity : null;
    },
  );
  if (identity === null) {
    throw makeZerospinError({
      code: 'session-not-initialized',
      message: 'Session store is not initialized',
    });
  }
  return identity;
}
