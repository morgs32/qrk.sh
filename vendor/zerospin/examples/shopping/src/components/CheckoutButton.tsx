import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@clerk/react-router';
import { isNull } from 'drizzle-orm';

import { Button } from './ui/button';

import { shopperSession } from '@/zerospin/shopperSession';

function waitForCartEdits(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const initial = shopperSession.store.getState();
    if (!initial.isInitialized) {
      reject(new Error('Checkout session changed.'));
      return;
    }
    const { db, schema } = initial;
    let settled = false;
    let unsubscribeSession: (() => void) | undefined;
    let unsubscribeDatabase: (() => void) | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribeSession?.();
      unsubscribeDatabase?.();
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error('Checkout session changed.'));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Cart changes have not settled yet. Retry checkout when connected.',
          ),
        ),
      15_000,
    );
    const check = () => {
      if (settled) return;
      const state = shopperSession.store.getState();
      if (!state.isInitialized || state.db !== db) {
        finish(new Error('Checkout session changed.'));
        return;
      }
      if (state.sessionStatus !== 'current') return;
      try {
        const unresolved = db
          .select({ sessionIndex: schema.commands.sessionIndex })
          .from(schema.commands)
          .where(isNull(schema.commands.executedIndex))
          .limit(1)
          .get();
        if (unresolved === undefined) finish();
      } catch (cause) {
        finish(cause instanceof Error ? cause : new Error(String(cause)));
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    unsubscribeSession = shopperSession.store.subscribe(check);
    unsubscribeDatabase = db.$client.subscribeToTableChanges(tableNames => {
      if (tableNames.has('commands')) check();
    });
    if (signal.aborted) abort();
    else check();
  });
}

export function CheckoutButton({
  cartId,
  shopperId,
  hasItems,
}: {
  cartId: string;
  shopperId: string;
  hasItems: boolean;
}) {
  const { getToken } = useAuth();
  const identity = `${shopperId}:${cartId}`;
  const selection = useRef(identity);
  selection.current = identity;
  const occurrence = useRef<{
    identity: string;
    cartId: string;
    nonce: string;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    controller.current = null;
    occurrence.current = null;
    setPending(false);
    setMessage(null);
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [identity]);
  const retained = occurrence.current?.identity === identity;
  const checkout = async () => {
    if (controller.current || pending || (!hasItems && !retained)) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const current = () =>
      mounted.current &&
      selection.current === identity &&
      !requestController.signal.aborted;
    setPending(true);
    setMessage('Waiting for cart changes…');
    try {
      const token = await getToken();
      if (!current()) return;
      if (!token) throw new Error('Sign in before checking out.');
      await waitForCartEdits(requestController.signal);
      if (!current()) return;
      if (occurrence.current?.identity !== identity) {
        occurrence.current = { identity, cartId, nonce: crypto.randomUUID() };
      }
      const { cartId: checkoutCartId, nonce } = occurrence.current;
      setMessage('Checking out…');
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cartId: checkoutCartId, nonce }),
        signal: requestController.signal,
      });
      const result: unknown = await response.json();
      if (!current()) return;
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('purchaseId' in result) ||
        typeof result.purchaseId !== 'string'
      ) {
        if (response.status === 409) occurrence.current = null;
        throw new Error(
          result &&
            typeof result === 'object' &&
            'message' in result &&
            typeof result.message === 'string'
            ? result.message
            : 'Checkout response is uncertain. Retry this checkout.',
        );
      }
      occurrence.current = null;
      setMessage(`Purchase ${result.purchaseId} accepted; payment pending.`);
    } catch (error) {
      if (current()) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Checkout could not be confirmed. Retry this checkout.',
        );
      }
    } finally {
      if (current()) {
        controller.current = null;
        setPending(false);
      }
    }
  };
  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={pending || (!hasItems && !retained)}
        onClick={() => void checkout()}
      >
        {pending ? 'Checking out…' : retained ? 'Retry checkout' : 'Checkout'}
      </Button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
