'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type {
  IIdentitySchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

type IInitializableSession<
  I extends IIdentitySchema,
  C extends Schema.Codec<unknown, unknown> | undefined,
> = {
  readonly identitySchema: I;
  readonly credentialsSchema?: C;
  readonly systemName: string;
  readonly definition:
    | { kind: 'aggregate'; aggregateName: string; aggregateVersion: string }
    | { kind: 'service'; serviceName: string; serviceVersion: string };
  readonly store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { isInitialized: boolean };
  };
  initialize(props: ISessionInitialization<I, C>): Promise<void>;
  dispose(): Promise<void>;
};

/**
 * React owns initialization after commit and disposal on unmount. Depends on
 * session identity, not credentials callback identity. Competing hooks that are
 * rejected synchronously never acquire disposal responsibility.
 */
export function useInitializeSession<
  I extends IIdentitySchema,
  C extends Schema.Codec<unknown, unknown> | undefined = undefined,
>(
  props: {
    session: IInitializableSession<I, C>;
  } & ISessionInitialization<NoInfer<I>, NoInfer<C>>,
): { isInitialized: boolean };
export function useInitializeSession(
  props: {
    session: IInitializableSession<
      IIdentitySchema,
      Schema.Codec<unknown, unknown> | undefined
    >;
  } & ISessionInitialization<
    IIdentitySchema,
    Schema.Codec<unknown, unknown> | undefined
  >,
): { isInitialized: boolean } {
  const { session } = props;
  const initializationRef = useRef(props);
  initializationRef.current = props;
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
      const start = () => {
        if (session.credentialsSchema === undefined) {
          const identity = initializationRef.current.identity;
          if (identity === undefined) {
            throw makeZerospinError('session-identity-required');
          }
          return session.initialize({ identity });
        }
        return session.initialize({
          getCredentials: () =>
            Effect.suspend(() => {
              const provider = initializationRef.current.getCredentials;
              if (provider === undefined) {
                return Effect.fail(
                  new Error('Verified sessions require getCredentials'),
                );
              }
              return provider();
            }).pipe(
              Effect.mapError(
                catchZerospinError({ code: 'session-credentials-invalid' }),
              ),
            ),
        });
      };
      const started = start();
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
