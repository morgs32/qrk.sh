'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/** Own a standalone session after commit; rejected competing mounts never dispose its owner. */
export function useInitializeStandaloneSession(props: {
  session: {
    readonly store: {
      subscribe: (listener: () => void) => () => void;
      getState: () => { isInitialized: boolean };
    };
    initialize(): Promise<void>;
    dispose(): Promise<void>;
  };
}): { isInitialized: boolean } {
  const { session } = props;
  const [startupError, setStartupError] = useState<{
    session: typeof session;
    error: unknown;
  } | null>(null);
  const isInitialized = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().isInitialized,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    let ownsDisposal = false;
    try {
      const started = session.initialize();
      ownsDisposal = true;
      void started.catch(error => {
        if (!cancelled) setStartupError({ session, error });
      });
    } catch (error) {
      setStartupError({ session, error });
    }
    return () => {
      cancelled = true;
      if (ownsDisposal) void session.dispose();
    };
  }, [session]);

  if (startupError?.session === session) throw startupError.error;
  return { isInitialized };
}
