import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import type {
  IAggregateFrontendController,
  IAnyAggregateFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import type { IAggregateSession } from '@zerospin/core/session/types';
import type { ISystem } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { bootstrapAggregateFrontendSession } from '@zerospin/frontend/bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from '@zerospin/frontend/bootstrapServiceFrontendSession';
import { makeTelemetryLayer } from '@zerospin/logger';
import { makeIdFromAbbreviation, type CuidFactory } from '@zerospin/schema';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  Redacted,
  Scope,
} from 'effect';

import { BrowserBackup } from '../BrowserBackup/BrowserBackup';
import type { IZerospinRuntime } from '../makeRuntime/makeRuntime';

type AggregatesOf<SYSTEM> =
  SYSTEM extends ISystem<infer A, infer _S, infer _N, infer _R> ? A : never;

type ServicesOf<SYSTEM> =
  SYSTEM extends ISystem<infer _A, infer S, infer _N, infer _R> ? S : never;

type SystemNameOf<SYSTEM> =
  SYSTEM extends ISystem<infer _A, infer _S, infer N, infer _R> ? N : never;

type AggregateSignatureOf<
  SYSTEM,
  FRONTEND extends { aggregateName: string; aggregateVersion: string },
> =
  FRONTEND['aggregateName'] extends keyof AggregatesOf<SYSTEM>
    ? FRONTEND['aggregateVersion'] extends keyof AggregatesOf<SYSTEM>[FRONTEND['aggregateName']]
      ? AggregatesOf<SYSTEM>[FRONTEND['aggregateName']][FRONTEND['aggregateVersion']]['authentication']['signatureSchema']['Type']
      : never
    : never;

type ServiceSignatureOf<
  SYSTEM,
  FRONTEND extends { serviceName: string; serviceVersion: string },
> =
  FRONTEND['serviceName'] extends keyof ServicesOf<SYSTEM>
    ? FRONTEND['serviceVersion'] extends keyof ServicesOf<SYSTEM>[FRONTEND['serviceName']]
      ? ServicesOf<SYSTEM>[FRONTEND['serviceName']][FRONTEND['serviceVersion']]['authentication']['signatureSchema']['Type']
      : never
    : never;

type AuthoredAggregateFrontend = Omit<
  IAggregateFrontendController,
  'systemName'
>;
type AuthoredServiceFrontend = Omit<IServiceFrontendController, 'systemName'>;

type SessionRuntimeServices = Async | CuidFactory | MonotonicFactory;

type LifecycleState = {
  attempt: number;
  scope: Scope.Closeable | null;
  fiber: Fiber.Fiber<unknown, unknown> | null;
  cleanup: Promise<void> | null;
  active: boolean;
};

function createLifecycle(): LifecycleState {
  return {
    attempt: 0,
    scope: null,
    fiber: null,
    cleanup: null,
    active: false,
  };
}
function admitInitialization(lifecycle: LifecycleState): {
  attempt: number;
  scope: Scope.Closeable;
  waitForCleanup: Promise<void> | null;
} {
  if (lifecycle.active) {
    throw new ZerospinError({
      code: 'frontend-already-mounted',
      message: 'Session already has an active initialization owner',
    });
  }
  lifecycle.active = true;
  lifecycle.attempt += 1;
  const attempt = lifecycle.attempt;
  const waitForCleanup = lifecycle.cleanup;
  const scope = Effect.runSync(Scope.make());
  lifecycle.scope = scope;
  return { attempt, scope, waitForCleanup };
}

function beginCleanup(
  lifecycle: LifecycleState,
  attempt: number,
  scope: Scope.Closeable,
): Promise<void> {
  if (lifecycle.attempt !== attempt) {
    return lifecycle.cleanup ?? Promise.resolve();
  }
  lifecycle.active = false;
  lifecycle.scope = null;
  lifecycle.fiber = null;
  const cleanup = Effect.runPromise(Scope.close(scope, Exit.void)).finally(
    () => {
      if (lifecycle.cleanup === cleanup && lifecycle.attempt === attempt) {
        lifecycle.cleanup = null;
      }
    },
  );
  lifecycle.cleanup = cleanup;
  return cleanup;
}

/**
 * Imperative browser session composition. Construction is synchronous and
 * acquires no resources. initialize/dispose own the resource lifecycle.
 */
export function makeSession<
  FRONTEND extends AuthoredAggregateFrontend,
  APP_SERVICES,
  SYSTEM_NAME extends string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS extends APP_SERVICES | SessionRuntimeServices = never,
>(props: {
  frontend: FRONTEND & { kind: 'aggregate' };
  runtime: IZerospinRuntime<APP_SERVICES>;
  layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  systemName: SYSTEM_NAME;
}): IAggregateSession<FRONTEND & { systemName: SYSTEM_NAME }> & {
  readonly systemName: SYSTEM_NAME;
  initialize<SYSTEM extends { name: string }>(initializeProps: {
    generateSignature: SystemNameOf<SYSTEM> extends SYSTEM_NAME
      ? () => Effect.Effect<AggregateSignatureOf<SYSTEM, FRONTEND>, IAnyError>
      : never;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export function makeSession<
  FRONTEND extends AuthoredServiceFrontend,
  APP_SERVICES,
  SYSTEM_NAME extends string,
>(props: {
  frontend: FRONTEND & { kind: 'service' };
  runtime: IZerospinRuntime<APP_SERVICES>;
  layer?: Layer.Layer<never, IAnyError, never>;
  systemName: SYSTEM_NAME;
}): IServiceSession<FRONTEND & { systemName: SYSTEM_NAME }> & {
  readonly systemName: SYSTEM_NAME;
  initialize<SYSTEM extends { name: string }>(initializeProps: {
    generateSignature: SystemNameOf<SYSTEM> extends SYSTEM_NAME
      ? () => Effect.Effect<ServiceSignatureOf<SYSTEM, FRONTEND>, IAnyError>
      : never;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export function makeSession(props: unknown): unknown {
  const {
    frontend: authoredFrontend,
    runtime,
    layer = Layer.empty,
    systemName,
  } = props as {
    frontend: (AuthoredAggregateFrontend | AuthoredServiceFrontend) & {
      kind: 'aggregate' | 'service';
    };
    // Implementation body erases APP_SERVICES; callers keep exact inference via overloads.
    runtime: IZerospinRuntime<any>;
    layer?: Layer.Layer<any, IAnyError, any>;
    systemName: string;
  };
  const frontend = { ...authoredFrontend, systemName };
  const lifecycle = createLifecycle();
  let generateSignatureRef: (() => Effect.Effect<unknown, IAnyError>) | null =
    null;
  const resolveSignature = () =>
    Effect.suspend(() => {
      const generateSignature = generateSignatureRef;
      if (generateSignature === null) {
        return new ZerospinError({
          code: 'frontend-signature-missing',
          message: `Missing signature generator for ${frontend.name}`,
        });
      }
      return generateSignature();
    });

  if (frontend.kind === 'aggregate') {
    const coreSession = makeAggregateSession({
      frontend: frontend as IAggregateFrontendController,
    });

    const initialize = (initializeProps: {
      generateSignature: () => Effect.Effect<unknown, IAnyError>;
    }): Promise<void> => {
      generateSignatureRef = initializeProps.generateSignature;
      // Admit or reject ownership synchronously before returning the promise.
      const admission = admitInitialization(lifecycle);
      return (async () => {
      if (admission.waitForCleanup !== null) {
        await admission.waitForCleanup;
      }
      if (lifecycle.attempt !== admission.attempt) {
        return;
      }

      const sessionScope = admission.scope;
      let published = false;
      const ready = Promise.withResolvers<void>();

      const program = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            coreSession.clearExecutionResources();
            coreSession.store.setState({
              sessionStatus: 'released',
              isInitialized: false,
              db: null,
              schema: null,
              models: null,
              sessionId: null,
              aggregateId: null,
              aggregateName: null,
              authentication: null,
              frontendName: null,
              aggregateFrontendLockKey: null,
              aggregateIndex: null,
              selectionIndex: null,
              selectionHash: null,
              pushIndex: null,
              backupState: { status: 'released', failure: null },
            });
          }),
        );

        const application = yield* runtime.contextEffect;
        return yield* Effect.gen(function* () {
          const backup = yield* BrowserBackup;
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          let executeAggregateFrontendCommand: NonNullable<
            Parameters<
              typeof coreSession.setExecutionResources
            >[0]['executeAggregateFrontendCommand']
          > | null = null;

          const guards = yield* initializeFrontendGuards({
            frontend: frontend as IAnyAggregateFrontendController,
            layer,
          });
          coreSession.setExecutionResources({
            sessionId,
            guards,
            runtime,
            executeAggregateFrontendCommand: executeProps =>
              executeAggregateFrontendCommand === null
                ? Effect.fail(
                    new ZerospinError({
                      code: 'aggregate-frontend-session-not-ready',
                      message:
                        'Command staging started before the aggregate replica was acquired',
                    }),
                  )
                : executeAggregateFrontendCommand(executeProps),
          });

          const apiUrl = yield* ZerospinApiUrl;
          const publishableKey = Redacted.value(yield* PublishableKey);
          const bootstrap = yield* bootstrapAggregateFrontendSession({
            aggregateVersion: frontend.aggregateVersion,
            session: coreSession,
            apiUrl,
            publishableKey,
            systemName,
            generateSignature: () =>
              runtime.runPromise(resolveSignature().pipe(encodeRpc)),
            claimBackup: ({ backupKey }) =>
              backup.claim({ backupKey, session: coreSession }),
          }).pipe(
            Effect.provide(
              makeTelemetryLayer(
                coreSession.store.getState().telemetryCollector,
              ),
            ),
            Effect.provide(AsyncLive),
          );
          executeAggregateFrontendCommand =
            bootstrap.executeAggregateFrontendCommand;

          const devtoolsEntry = {
            session: coreSession,
            getPushPaused: () =>
              runtime.runPromise(bootstrap.getPushPaused.pipe(encodeRpc)),
            setPushPaused: (pushPausedProps: { pushPaused: boolean }) =>
              runtime.runPromise(
                bootstrap.setPushPaused(pushPausedProps).pipe(encodeRpc),
              ),
            pushNow: () =>
              runtime.runPromise(bootstrap.pushNow.pipe(encodeRpc)),
          };
          let registeredSessionId = coreSession.sessionId;
          if (registeredSessionId !== null) {
            zerospinDevtoolsStore.getState().addAggregateSession(devtoolsEntry);
          }
          const unsubscribe = coreSession.store.subscribe(state => {
            if (
              state.sessionId === registeredSessionId ||
              state.sessionId === null
            ) {
              return;
            }
            if (registeredSessionId !== null) {
              zerospinDevtoolsStore
                .getState()
                .removeAggregateSession(registeredSessionId);
            }
            registeredSessionId = state.sessionId;
            zerospinDevtoolsStore.getState().addAggregateSession(devtoolsEntry);
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              unsubscribe();
              if (registeredSessionId !== null) {
                zerospinDevtoolsStore
                  .getState()
                  .removeAggregateSession(registeredSessionId);
              }
            }),
          );

          published = true;
          ready.resolve();
          return yield* Effect.never;
        }).pipe(Effect.provideContext(application));
      }).pipe(Scope.provide(sessionScope));

      const fiber = runtime.runFork(
        program.pipe(
          Effect.catchCause(cause =>
            Effect.sync(() => {
              ready.reject(Cause.squash(cause));
            }),
          ),
        ),
      );
      lifecycle.fiber = fiber;
      Effect.runSync(
        Scope.addFinalizer(
          sessionScope,
          Effect.sync(() => {
            Effect.runFork(Fiber.interrupt(fiber));
          }),
        ),
      );

      try {
        await ready.promise;
        if (!published || !coreSession.store.getState().isInitialized) {
          await beginCleanup(lifecycle, admission.attempt, sessionScope);
          throw new ZerospinError({
            code: 'aggregate-frontend-session-not-ready',
            message:
              'Session initialization ended without publishing readiness',
          });
        }
      } catch (error) {
        await beginCleanup(lifecycle, admission.attempt, sessionScope);
        throw error;
      }
      })();
    };

    const dispose = async () => {
      if (lifecycle.scope === null) {
        return lifecycle.cleanup ?? Promise.resolve();
      }
      return beginCleanup(lifecycle, lifecycle.attempt, lifecycle.scope);
    };

    // Same object identity as the core session so stageCommand WeakMap lookups
    // and DevTools registration share one session reference.
    return Object.assign(coreSession, {
      systemName,
      initialize,
      dispose,
    });
  }

  const coreSession = makeServiceSession({
    frontend: frontend as IServiceFrontendController,
    models: frontend.models,
  });

  const initialize = (initializeProps: {
    generateSignature: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void> => {
    generateSignatureRef = initializeProps.generateSignature;
    const admission = admitInitialization(lifecycle);
    return (async () => {
    if (admission.waitForCleanup !== null) {
      await admission.waitForCleanup;
    }
    if (lifecycle.attempt !== admission.attempt) {
      return;
    }

    const sessionScope = admission.scope;
    let published = false;
    const ready = Promise.withResolvers<void>();

    const program = Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          coreSession.store.setState({
            sessionStatus: 'released',
            isInitialized: false,
            db: null,
            schema: null,
            models: null,
            sessionId: null,
            authentication: null,
            serviceName: null,
            frontendName: null,
            serviceFrontendLockKey: null,
            serviceIndex: null,
            serviceHash: null,
            serviceVersion: null,
            backupState: { status: 'released', failure: null },
          });
        }),
      );
      const application = yield* runtime.contextEffect;
      return yield* Effect.gen(function* () {
        const backup = yield* BrowserBackup;
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        coreSession.setSessionId(sessionId);
        const apiUrl = yield* ZerospinApiUrl;
        const publishableKey = Redacted.value(yield* PublishableKey);
        yield* bootstrapServiceFrontendSession({
          serviceVersion: frontend.serviceVersion,
          session: coreSession,
          apiUrl,
          publishableKey,
          systemName,
          generateSignature: () =>
            runtime.runPromise(resolveSignature().pipe(encodeRpc)),
          claimBackup: ({ backupKey }) =>
            backup.claim({ backupKey, session: coreSession }),
        }).pipe(
          Effect.provide(
            makeTelemetryLayer(coreSession.store.getState().telemetryCollector),
          ),
          Effect.provide(AsyncLive),
        );

        zerospinDevtoolsStore.getState().addServiceSession({
          session: coreSession,
        });
        let registeredSessionId = coreSession.sessionId;
        const unsubscribe = coreSession.store.subscribe(state => {
          if (
            state.sessionId === registeredSessionId ||
            state.sessionId === null
          ) {
            return;
          }
          if (registeredSessionId !== null) {
            zerospinDevtoolsStore
              .getState()
              .removeServiceSession(registeredSessionId);
          }
          registeredSessionId = state.sessionId;
          zerospinDevtoolsStore.getState().addServiceSession({
            session: coreSession,
          });
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unsubscribe();
            if (registeredSessionId !== null) {
              zerospinDevtoolsStore
                .getState()
                .removeServiceSession(registeredSessionId);
            }
          }),
        );

        published = true;
        ready.resolve();
        return yield* Effect.never;
      }).pipe(Effect.provideContext(application));
    }).pipe(Scope.provide(sessionScope));

    const fiber = runtime.runFork(
      program.pipe(
        Effect.catchCause(cause =>
          Effect.sync(() => {
            ready.reject(Cause.squash(cause));
          }),
        ),
      ),
    );
    lifecycle.fiber = fiber;
    Effect.runSync(
      Scope.addFinalizer(
        sessionScope,
        Effect.sync(() => {
          Effect.runFork(Fiber.interrupt(fiber));
        }),
      ),
    );

    try {
      await ready.promise;
      if (!published || !coreSession.store.getState().isInitialized) {
        await beginCleanup(lifecycle, admission.attempt, sessionScope);
        throw new ZerospinError({
          code: 'service-session-store-not-initialized',
          message: 'Session initialization ended without publishing readiness',
        });
      }
    } catch (error) {
      await beginCleanup(lifecycle, admission.attempt, sessionScope);
      throw error;
    }
    })();
  };

  const dispose = async () => {
    if (lifecycle.scope === null) {
      return lifecycle.cleanup ?? Promise.resolve();
    }
    return beginCleanup(lifecycle, lifecycle.attempt, lifecycle.scope);
  };

  return Object.assign(coreSession, {
    systemName,
    initialize,
    dispose,
  });
}
