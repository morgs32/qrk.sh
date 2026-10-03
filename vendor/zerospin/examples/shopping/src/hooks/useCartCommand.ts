import { useRef, useState, useSyncExternalStore } from 'react';

import { shopperSession } from '@/zerospin/shopperSession';

/** Keep a submission pending until durable staging; retain authoritative failures. */
export function useCartCommand() {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandIds, setCommandIds] = useState<string[]>([]);
  const state = useSyncExternalStore(
    shopperSession.store.subscribe,
    shopperSession.store.getState,
  );
  const failure = state.commandHistory?.findLast(
    command => commandIds.includes(command.id) && command.failure !== null,
  )?.failure;
  return {
    pending,
    error: error ?? failure?.message ?? null,
    submit: async (work: (record: (id: string) => void) => Promise<void>) => {
      if (submitting.current) return;
      submitting.current = true;
      setPending(true);
      setError(null);
      setCommandIds([]);
      try {
        await work(id => setCommandIds(ids => [...ids, id]));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : typeof cause === 'object' && cause !== null && 'message' in cause
              ? String(cause.message)
              : 'Could not stage the cart command.',
        );
      } finally {
        submitting.current = false;
        setPending(false);
      }
    },
  };
}
