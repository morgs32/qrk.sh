'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type {
  IClaimsSchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import {
  catchZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, type Schema } from 'effect';

export type IInitializableSession<
  I extends IClaimsSchema,
  C extends Schema.Codec<unknown, unknown> | undefined,
> = {
  readonly claimsSchema: I;
  readonly credentialsSchema?: C;
  readonly store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { isInitialized: boolean };
  };
  initialize(props: ISessionInitialization<I, C>): Promise<void>;
  dispose(): Promise<void>;
};

type ILifecycleProps = {
  session: {
    readonly claimsSchema: IClaimsSchema;
    readonly credentialsSchema?: Schema.Codec<unknown, unknown> | undefined;
    readonly store: IInitializableSession<IClaimsSchema, undefined>['store'];
    initialize(props: unknown): Promise<void>;
    dispose(): Promise<void>;
  };
  claims?: Readonly<Record<string, unknown>>;
  expectedClaims?: Readonly<Record<string, unknown>>;
  getCredentials?: () => Effect.Effect<unknown, IAnyError>;
};

/** Shared resource ownership; each public hook supplies its own subscriptions. */
export function useInitializeSessionLifecycle<PROPS extends ILifecycleProps>(
  props: PROPS,
  subscribe?: (latest: () => PROPS | null) => readonly (() => void)[],
): { isInitialized: boolean } {
  const { session } = props;
  const initializationRef = useRef(props);
  initializationRef.current = props;
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const [startupError, setStartupError] = useState<{
    session: typeof session;
    error: unknown;
  } | null>(null);
  const isInitialized = useSyncExternalStore(
    session.store.subscribe,
    () => session.store.getState().isInitialized === true,
    () => session.store.getState().isInitialized === true,
  );

  useEffect(() => {
    let cancelled = false;
    let ownsDisposal = false;
    let unsubscribes: readonly (() => void)[] = [];
    const latest = () =>
      !cancelled && initializationRef.current.session === session
        ? initializationRef.current
        : null;
    try {
      const start = () => {
        if (session.credentialsSchema === undefined) {
          const claims = initializationRef.current.claims;
          if (claims === undefined) {
            throw makeZerospinError('session-claims-required');
          }
          return session.initialize({ claims });
        }
        return session.initialize({
          ...(initializationRef.current.expectedClaims === undefined
            ? {}
            : {
                expectedClaims: structuredClone(
                  initializationRef.current.expectedClaims,
                ),
              }),
          getCredentials: () =>
            Effect.suspend(() => {
              const current = latest();
              if (current === null) {
                return Effect.fail(
                  makeZerospinError('session-initialization-canceled'),
                );
              }
              const provider = current.getCredentials;
              return provider === undefined
                ? Effect.fail(makeZerospinError('session-credentials-required'))
                : provider();
            }).pipe(
              Effect.mapError(
                catchZerospinError({ code: 'session-credentials-invalid' }),
              ),
            ),
        });
      };
      const started = start();
      ownsDisposal = true;
      unsubscribes = subscribeRef.current?.(latest) ?? [];
      void started.catch(error => {
        if (latest() !== null) setStartupError({ session, error });
      });
    } catch (error) {
      if (latest() !== null) setStartupError({ session, error });
    }
    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (ownsDisposal) void session.dispose();
    };
  }, [session]);

  if (startupError?.session === session) throw startupError.error;
  return { isInitialized };
}
