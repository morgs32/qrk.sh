'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { IFrontendController } from '@zerospin/core/frontendController/types';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { pushStagedCommands } from '@zerospin/frontend/pushStagedCommands';
import { makeTelemetryLayer } from '@zerospin/logger';
import { Duration, Effect, Exit, Fiber, Queue, Ref, Schema } from 'effect';
import { useStore } from 'zustand/react';

import type { IBrowserSession, ISessionProviderRuntime } from './types';

export function usePushQueue<FRONTEND extends IFrontendController>(props: {
  session: IBrowserSession<FRONTEND>;
  pushQueue: Queue.Queue<number>;
  sessionRuntime: ISessionProviderRuntime;
  enabled: boolean;
}) {
  const { enabled, pushQueue, session, sessionRuntime } = props;

  const isPushPaused = useStore(session.store, state => state.isPushPaused);
  const pushEnabled = enabled && !isPushPaused;

  const setOnlineRef = useRef<(online: boolean) => void>(() => {});

  const manuallyPushStagedCommands = useCallback(() => {
    // Pre-initialization push is an ordering error: fail the caller
    // synchronously instead of leaving a hung or rejected orphan Promise.
    getInitializedStateOrThrow({ session: session.coreSession });
    return sessionRuntime.runPromise(
      Effect.gen(function* () {
        // 1 — This span exists only for an explicit DevTools push. Automatic
        // queue drains keep their existing tracing and never update the
        // session's manual-push pointer.
        const span = yield* Effect.currentSpan.pipe(Effect.orDie);
        const traceId = Schema.decodeUnknownSync(
          Schema.TemplateLiteral('trc_', Schema.String),
        )(span.traceId);

        // 2 — Record the same trace for either settlement while preserving
        // the original push result or failure for the imperative caller.
        return yield* pushStagedCommands({
          session: session.coreSession,
        }).pipe(
          Effect.onExit(exit =>
            Effect.sync(() => {
              session.coreSession.store.setState({
                lastDevtoolsPush: {
                  traceId,
                  completedAt: Date.now(),
                  status: Exit.isSuccess(exit) ? 'ok' : 'error',
                },
              });
            }),
          ),
        );
      }).pipe(
        Effect.withSpan('devtools.pushStagedCommands'),
        Effect.provide(
          makeTelemetryLayer(
            session.coreSession.store.getState().telemetryCollector,
          ),
        ),
      ),
    );
  }, [session, sessionRuntime]);

  useEffect(() => {
    if (!pushEnabled) {
      return;
    }

    const setupFiber = sessionRuntime.runFork(
      Effect.gen(function* () {
        const isOnline = yield* Ref.make(
          typeof navigator !== 'undefined' ? navigator.onLine : true,
        );

        yield* Effect.fork(
          Effect.forever(
            Effect.gen(function* () {
              if (!(yield* Ref.get(isOnline))) {
                yield* Effect.sleep(Duration.millis(200));
                return;
              }

              yield* Queue.take(pushQueue);

              yield* pushStagedCommands({
                session: session.coreSession,
              }).pipe(
                Effect.provide(
                  makeTelemetryLayer(
                    session.coreSession.store.getState().telemetryCollector,
                  ),
                ),
              );
            }),
          ),
        );

        setOnlineRef.current = (online: boolean) => {
          sessionRuntime.runSync(Ref.set(isOnline, online));
          if (online) {
            sessionRuntime.runFork(Queue.offer(pushQueue, Date.now()));
          }
        };
        setOnlineRef.current(
          typeof navigator !== 'undefined' ? navigator.onLine : true,
        );

        return yield* Effect.never;
      }),
    );

    return () => {
      void sessionRuntime.runPromise(Fiber.interrupt(setupFiber));
      setOnlineRef.current = () => {};
    };
  }, [enabled, isPushPaused, pushQueue, pushEnabled, session, sessionRuntime]);

  useEffect(() => {
    if (!pushEnabled || typeof window === 'undefined') {
      return;
    }

    const onOnline = () => {
      setOnlineRef.current(true);
    };
    const onOffline = () => {
      setOnlineRef.current(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [pushEnabled]);

  return {
    pushStagedCommands: manuallyPushStagedCommands,
  };
}
