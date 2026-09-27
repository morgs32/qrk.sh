import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Scope,
} from 'effect';

import type {
  ISessionRuntimeServices,
  IZerospinRuntime,
} from './sessionRuntime';

/** One reusable session owns successive, independently disposed runtime lifetimes. */
export function makeSessionLifecycle<APP_SERVICES, INFRASTRUCTURE>(props: {
  layer: Layer.Layer<APP_SERVICES, IAnyError>;
  infrastructure: Layer.Layer<INFRASTRUCTURE, IAnyError>;
  onDispose(): void;
}) {
  const { layer, infrastructure, onDispose } = props;
  if (Object.getPrototypeOf(layer) !== Object.getPrototypeOf(Layer.empty)) {
    throw makeZerospinError({
      code: 'zerospin-app-effect-runtime-mismatch',
      message:
        'The application layer was created by a different Effect runtime than Zerospin Browser. Ensure the app and Zerospin resolve to the same Effect installation, then rebuild.',
    });
  }
  const makeRuntime = () =>
    ManagedRuntime.make(
      Layer.mergeAll(
        NanoIdFactory,
        UlidMonotonicFactory,
        AsyncLive,
        infrastructure,
        layer,
      ),
    );
  type IRuntime = IZerospinRuntime<APP_SERVICES | INFRASTRUCTURE>;
  type IAttempt = {
    runtime: IRuntime | null;
    scope: Scope.Closeable;
    fiber: Fiber.Fiber<unknown, unknown> | null;
    ready: PromiseWithResolvers<void>;
    previousCleanup: Promise<void>;
    cleanup: Promise<void> | null;
    canceled: boolean;
  };
  let runtime = makeRuntime();
  let runtimeDisposed = false;
  let active: IAttempt | null = null;
  let cleanup = Promise.resolve();

  const close = (attempt: IAttempt): Promise<void> => {
    if (attempt.cleanup !== null) return attempt.cleanup;
    attempt.canceled = true;
    attempt.ready.reject(
      makeZerospinError({
        code: 'session-initialization-canceled',
        message: 'Session initialization was canceled by disposal',
      }),
    );
    if (active === attempt) active = null;
    if (attempt.runtime === runtime) runtimeDisposed = true;
    const closing = (async () => {
      try {
        await attempt.previousCleanup;
      } finally {
        try {
          if (attempt.fiber !== null) {
            await Effect.runPromise(Fiber.interrupt(attempt.fiber));
          }
          await Effect.runPromise(Scope.close(attempt.scope, Exit.void));
        } finally {
          try {
            onDispose();
          } finally {
            await attempt.runtime?.dispose();
          }
        }
      }
    })();
    attempt.cleanup = closing;
    cleanup = closing;
    return closing;
  };

  const makeAttempt = (): IAttempt => {
    const ready = Promise.withResolvers<void>();
    // Disposal can cancel an admission while it is still waiting for earlier cleanup.
    void ready.promise.catch(() => undefined);
    return {
      runtime: runtimeDisposed ? null : runtime,
      scope: Scope.makeUnsafe(),
      fiber: null,
      ready,
      previousCleanup: cleanup.catch(() => undefined),
      cleanup: null,
      canceled: false,
    };
  };

  return {
    get runtime(): IRuntime {
      return runtime;
    },
    initialize(
      start: (props: {
        runtime: IRuntime;
        ready(): void;
      }) => Effect.Effect<
        unknown,
        unknown,
        ISessionRuntimeServices | APP_SERVICES | INFRASTRUCTURE | Scope.Scope
      >,
    ): Promise<void> {
      if (active !== null) {
        throw makeZerospinError({
          code: 'session-already-mounted',
          message: 'Session already has an active initialization owner',
        });
      }
      const attempt = makeAttempt();
      active = attempt;
      return (async () => {
        try {
          await attempt.previousCleanup;
          if (attempt.canceled) return await attempt.ready.promise;
          if (attempt.runtime === null) {
            runtime = makeRuntime();
            runtimeDisposed = false;
            attempt.runtime = runtime;
          }
          const ownedRuntime = attempt.runtime;
          const fiber = ownedRuntime.runFork(
            Effect.suspend(() =>
              start({
                runtime: ownedRuntime,
                ready: () => {
                  if (!attempt.canceled) attempt.ready.resolve();
                },
              }),
            ).pipe(Scope.provide(attempt.scope)),
          );
          attempt.fiber = fiber;
          fiber.addObserver(exit => {
            if (Exit.isFailure(exit)) {
              attempt.ready.reject(Cause.squash(exit.cause));
            } else {
              attempt.ready.reject(
                makeZerospinError({
                  code: 'session-not-ready',
                  message:
                    'Session initialization ended without publishing readiness',
                }),
              );
            }
          });
          await attempt.ready.promise;
          if (attempt.canceled) {
            throw makeZerospinError('session-initialization-canceled');
          }
        } catch (error) {
          await close(attempt);
          throw error;
        }
      })();
    },
    dispose(): Promise<void> {
      if (active !== null) return close(active);
      if (runtimeDisposed) return cleanup;
      return close(makeAttempt());
    },
  };
}
