'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

type MockInitializableSession = {
  readonly store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { isInitialized: boolean };
  };
  initialize(props?: {
    generateSignature?: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

/**
 * React owns mock-session initialization after commit and disposal on unmount.
 * No system generic and no signature — fixtures never authenticate.
 * Competing hooks that are rejected synchronously never acquire disposal
 * responsibility.
 */
export function useInitializeMockSession(props: {
  session: MockInitializableSession;
}): { isInitialized: boolean } {
  const { session } = props;
  const [startupError, setStartupError] = useState<unknown>(null);

  const isInitialized = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().isInitialized === true,
    () => session.store.getState().isInitialized === true,
  );

  useEffect(() => {
    let cancelled = false;
    let ownsDisposal = false;

    try {
      const started = session.initialize();
      ownsDisposal = true;
      void started.catch(error => {
        if (!cancelled) {
          setStartupError(error);
        }
      });
    } catch (error) {
      if (!cancelled) {
        setStartupError(error);
      }
    }

    return () => {
      cancelled = true;
      if (ownsDisposal) {
        void session.dispose();
      }
    };
  }, [session]);

  if (startupError !== null) {
    throw startupError;
  }

  return { isInitialized };
}
