'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { IAnyError } from '@zerospin/error';
import type { ISystem } from '@zerospin/core/system/types';
import { Effect } from 'effect';

type AggregatesOf<SYSTEM> =
  SYSTEM extends ISystem<infer A, infer _S, infer _N, infer _R> ? A : never;

type ServicesOf<SYSTEM> =
  SYSTEM extends ISystem<infer _A, infer S, infer _N, infer _R> ? S : never;

type AggregateSignatureOf<
  SYSTEM,
  FRONTEND extends { aggregateName: string; aggregateVersion: string },
> =
  FRONTEND['aggregateName'] extends keyof AggregatesOf<SYSTEM>
    ? FRONTEND['aggregateVersion'] extends keyof AggregatesOf<SYSTEM>[FRONTEND['aggregateName']]
      ? AggregatesOf<SYSTEM>[FRONTEND['aggregateName']][FRONTEND['aggregateVersion']]['authentication']['signatureSchema']['Type']
      : {
          [V in keyof AggregatesOf<SYSTEM>[FRONTEND['aggregateName']]]: AggregatesOf<SYSTEM>[FRONTEND['aggregateName']][V]['authentication']['signatureSchema']['Type'];
        }[keyof AggregatesOf<SYSTEM>[FRONTEND['aggregateName']]]
    : never;

type ServiceSignatureOf<
  SYSTEM,
  FRONTEND extends { serviceName: string; serviceVersion: string },
> =
  FRONTEND['serviceName'] extends keyof ServicesOf<SYSTEM>
    ? FRONTEND['serviceVersion'] extends keyof ServicesOf<SYSTEM>[FRONTEND['serviceName']]
      ? ServicesOf<SYSTEM>[FRONTEND['serviceName']][FRONTEND['serviceVersion']]['authentication']['signatureSchema']['Type']
      : {
          [V in keyof ServicesOf<SYSTEM>[FRONTEND['serviceName']]]: ServicesOf<SYSTEM>[FRONTEND['serviceName']][V]['authentication']['signatureSchema']['Type'];
        }[keyof ServicesOf<SYSTEM>[FRONTEND['serviceName']]]
    : never;

type SignatureForSessionFrontend<SYSTEM, FRONTEND> = FRONTEND extends {
  kind: 'aggregate';
  aggregateName: string;
  aggregateVersion: string;
}
  ? AggregateSignatureOf<SYSTEM, FRONTEND>
  : FRONTEND extends {
        kind: 'service';
        serviceName: string;
        serviceVersion: string;
      }
    ? ServiceSignatureOf<SYSTEM, FRONTEND>
    : never;

type InitializableSession = {
  readonly systemName: string;
  readonly frontend:
    | { kind: 'aggregate'; aggregateName: string; aggregateVersion: string }
    | { kind: 'service'; serviceName: string; serviceVersion: string };
  readonly store: {
    subscribe: (listener: () => void) => () => void;
    getState: () => { isInitialized: boolean };
  };
  initialize(props: {
    generateSignature: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

/**
 * React owns initialization after commit and disposal on unmount. Depends on
 * session identity, not signature callback identity. Competing hooks that are
 * rejected synchronously never acquire disposal responsibility.
 */
export function useInitializeSession<
  SYSTEM extends ISystem,
  SESSION extends InitializableSession & {
    systemName: SYSTEM extends { name: infer N extends string } ? N : never;
    frontend: SYSTEM extends ISystem
      ?
          | {
              kind: 'aggregate';
              aggregateName: keyof AggregatesOf<SYSTEM> & string;
              aggregateVersion: string;
            }
          | {
              kind: 'service';
              serviceName: keyof ServicesOf<SYSTEM> & string;
              serviceVersion: string;
            }
      : never;
  } = InitializableSession & {
    systemName: SYSTEM extends { name: infer N extends string } ? N : never;
    frontend: SYSTEM extends ISystem
      ?
          | {
              kind: 'aggregate';
              aggregateName: keyof AggregatesOf<SYSTEM> & string;
              aggregateVersion: string;
            }
          | {
              kind: 'service';
              serviceName: keyof ServicesOf<SYSTEM> & string;
              serviceVersion: string;
            }
      : never;
  },
>(props: {
  session: SESSION;
  generateSignature?: () => Effect.Effect<
    SignatureForSessionFrontend<SYSTEM, SESSION['frontend']>,
    IAnyError
  >;
}): { isInitialized: boolean } {
  const { session, generateSignature } = props;
  const generateSignatureRef = useRef(generateSignature);
  generateSignatureRef.current = generateSignature;
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
      const started = session.initialize({
        generateSignature: () =>
          Effect.suspend(() => {
            const latest = generateSignatureRef.current;
            if (latest === undefined) {
              return Effect.succeed(undefined as never);
            }
            return latest();
          }),
      });
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
