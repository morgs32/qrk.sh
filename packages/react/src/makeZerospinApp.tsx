'use client';

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { acquireBackupWorker } from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IAnyFrontendController } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { bootstrapAggregateFrontendSession } from '@zerospin/frontend/bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from '@zerospin/frontend/bootstrapServiceFrontendSession';
import { makeTelemetryLayer } from '@zerospin/logger';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type CuidFactory,
} from '@zerospin/schema';
import {
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Redacted,
  Schema,
  Scope,
} from 'effect';

import { makeBrowserSession } from './makeBrowserSession';
import type { ISessionProviderRuntime } from './types';
import { ZerospinDevtoolsLoader } from './ZerospinDevtoolsLoader';
import {
  ZerospinProviderContext,
  type ISessionRegistryEntry,
} from './ZerospinProviderContext';

declare global {
  interface Window {
    zerospin?: {
      devtools?: {
        open(): Promise<void>;
      };
    };
  }
}

const pageProviderOwnerKey = Symbol.for('@zerospin/react/page-provider-owner');

/*
 * Creates the frontend selectors and React Provider used by the application.
 * The Provider owns the mounted session scope and publishes the complete session
 * registry; frontend bootstrap procedures own replica acquisition and recovery.
 *
 * 1. Resolve the configured frontend mounts.
 * 2. Establish Provider state and exclusive page ownership.
 * 3. Prepare shared authentication and backup dependencies.
 * 4. Bootstrap aggregate and service sessions concurrently.
 * 5. Track DevTools registrations for each session's lifetime.
 * 6. Require every bootstrap to resolve the same system and user.
 * 7. Publish the complete registry and keep its scope alive.
 * 8. Surface startup failures and release ownership on teardown.
 * 9. Expose context and render children once all sessions are registered.
 */
export function makeZerospinApp<
  const SYSTEM_NAME extends string,
  const AUTHENTICATION_VERSION extends string,
  SIGNATURE extends Schema.Codec<unknown, unknown>,
  APP_SERVICES,
  const FRONTENDS extends Readonly<
    Record<
      string,
      IAnyFrontendController<
        | APP_SERVICES
        | Async
        | CuidFactory
        | MonotonicFactory
        | PublishableKey
        | ZerospinApiUrl
      >
    >
  >,
>(props: {
  systemName: SYSTEM_NAME;
  authentication: Readonly<{
    signature: SIGNATURE;
    version: AUTHENTICATION_VERSION;
  }>;
  frontends: FRONTENDS & {
    readonly [FRONTEND_NAME in keyof FRONTENDS]: FRONTENDS[FRONTEND_NAME] extends infer FRONTEND extends
      IAnyFrontendController
      ? FRONTEND['systemName'] extends SYSTEM_NAME
        ? FRONTEND['name'] extends FRONTEND_NAME
          ? FRONTENDS[FRONTEND_NAME]
          : never
        : never
      : never;
  };
  layer: Layer.Layer<APP_SERVICES | PublishableKey | ZerospinApiUrl, IAnyError>;
}) {
  // 1 — resolve mounts once against their configured names and systemName.
  const {
    authentication,
    frontends: sourceFrontends,
    layer: applicationLayer,
    systemName,
  } = props;
  const frontends: {
    readonly [FRONTEND_NAME in keyof FRONTENDS]: Readonly<{
      frontend: FRONTENDS[FRONTEND_NAME];
      models: FRONTENDS[FRONTEND_NAME]['models'];
    }>;
  } = Object.create(null);
  for (const [frontendName, frontend] of Object.entries(sourceFrontends)) {
    if (frontend.systemName !== systemName) {
      throw new Error(
        `makeZerospinApp frontend "${frontendName}" belongs to system "${frontend.systemName}", not "${systemName}".`,
      );
    }
    if (frontend.name !== frontendName) {
      throw new Error(
        `makeZerospinApp frontends key "${frontendName}" must equal controller name "${frontend.name}".`,
      );
    }
    Reflect.set(frontends, frontendName, { frontend, models: frontend.models });
  }

  const mountedFrontends = frontends;

  function Provider(providerProps: {
    generateSignature: ISignatureFactory &
      (() => Effect.Effect<Schema.Schema.Type<SIGNATURE>, IAnyError>);
    aggregateIds: {
      readonly [ENTRY in FRONTENDS[keyof FRONTENDS] as ENTRY extends {
        kind: 'aggregate';
        name: infer FRONTEND_NAME extends string;
      }
        ? FRONTEND_NAME
        : never]: IAggregateId;
    };
    children: ReactNode;
  }) {
    // 2 — reject nesting; retain the latest signature factory across renders.
    const parentProvider = useContext(ZerospinProviderContext);
    if (parentProvider !== null) {
      throw new Error(
        'ZerospinApp.Provider cannot be mounted inside another ZerospinApp.Provider.',
      );
    }

    const { aggregateIds, children, generateSignature } = providerProps;
    const generateSignatureRef = useRef(generateSignature);
    generateSignatureRef.current = generateSignature;
    const aggregateIdsKey = JSON.stringify(aggregateIds);
    const [sessions, setSessions] = useState<
      ReadonlyMap<object, ISessionRegistryEntry>
    >(() => new Map());
    const [startupError, setStartupError] = useState<IAnyError | null>(null);

    const [providerRuntime, setProviderRuntime] = useState<{
      runtime: ISessionProviderRuntime<APP_SERVICES>;
      scope: Scope.Closeable;
    } | null>(null);

    useEffect(() => {
      const scope = Effect.runSync(Scope.make());
      const runtime = ManagedRuntime.make(
        Layer.mergeAll(
          NanoIdFactory,
          UlidMonotonicFactory,
          AsyncLive,
          applicationLayer,
        ),
      );
      setProviderRuntime({ runtime, scope });
      return () => {
        Effect.runFork(
          Scope.close(scope, Exit.void).pipe(
            Effect.ensuring(runtime.disposeEffect),
          ),
        );
      };
    }, []);

    useEffect(() => {
      if (providerRuntime === null) return;
      const sessionRuntime = providerRuntime.runtime;
      const sessionScope = Effect.runSync(Scope.fork(providerRuntime.scope));
      // 2 — claim the page until this aggregateIdsKey scope ends.
      const pageProviderOwner = {};
      if (Reflect.get(globalThis, pageProviderOwnerKey) !== undefined) {
        setStartupError(
          new ZerospinError({
            code: 'zerospin-app-provider-already-mounted',
            message: 'Exactly one ZerospinApp.Provider may be active in a page',
          }),
        );
        return;
      }
      Reflect.set(globalThis, pageProviderOwnerKey, pageProviderOwner);
      const releasePageProviderOwner = () => {
        if (
          Reflect.get(globalThis, pageProviderOwnerKey) === pageProviderOwner
        ) {
          Reflect.deleteProperty(globalThis, pageProviderOwnerKey);
        }
      };
      let cancelled = false;
      setSessions(new Map());
      setStartupError(null);

      const program = Effect.flatMap(
        sessionRuntime.contextEffect,
        application =>
          Effect.scoped(
            Effect.gen(function* () {
              // 3 — an empty mount set needs no backup connection.
              const selectedFrontends: [
                string,
                {
                  frontend: IAnyFrontendController<
                    | APP_SERVICES
                    | Async
                    | CuidFactory
                    | MonotonicFactory
                    | PublishableKey
                    | ZerospinApiUrl
                  >;
                  models: IAnyFrontendController['models'];
                },
              ][] = Object.entries(frontends);
              if (selectedFrontends.length === 0) {
                yield* Effect.sync(() => {
                  if (!cancelled) {
                    setSessions(new Map());
                  }
                });

                // 3 — keep the empty Provider scope alive until React tears it down.
                return yield* Effect.never;
              }

              // 3 — encode fresh signatures and share one backup worker connection.
              const authenticationLock = makeAuthenticationLock(authentication);
              const generateValidatedSignature = () =>
                generateSignatureRef.current().pipe(
                  Effect.flatMap(
                    Schema.encodeUnknownEffect(authentication.signature),
                  ),
                  Effect.mapError(error =>
                    ZerospinError.isZerospinError(error)
                      ? error
                      : new ZerospinError({
                          code: 'authentication-signature-invalid',
                          message:
                            'Generated authentication signature does not match the selected schema',
                          cause: ZerospinError.prettyUnknownFailure(error),
                        }),
                  ),
                );
              const apiUrl = yield* ZerospinApiUrl;
              const publishableKey = Redacted.value(yield* PublishableKey);
              const backupWorker = yield* acquireBackupWorker();

              // 4 — each selected frontend gets its own session and bootstrap.
              const initializedSessions = yield* Effect.all(
                selectedFrontends.map(([frontendName, selector]) =>
                  Effect.gen(function* () {
                    const sessionId = yield* makeIdFromAbbreviation({
                      abbreviation: coreAbbreviations.session,
                    });
                    const frontend = selector.frontend;
                    if (frontend.kind === 'aggregate') {
                      // 4 — validate the aggregate ID; commands fail until bootstrap binds execution.
                      const aggregateId = yield* Schema.decodeUnknownEffect(
                        makeAbbreviationIdSchema(coreAbbreviations.aggregate),
                      )(
                        Reflect.get(
                          JSON.parse(aggregateIdsKey),
                          frontendName,
                        ),
                      ).pipe(
                        Effect.mapError(
                          () =>
                            new ZerospinError({
                              code: 'aggregate-target-required',
                              message: `Provider requires aggregateIds.${frontendName} for frontend "${frontendName}"`,
                            }),
                        ),
                      );
                      let executeAggregateFrontendCommand: NonNullable<
                        Parameters<
                          typeof makeAggregateSession
                        >[0]['executeAggregateFrontendCommand']
                      > | null = null;
                      const guards = yield* frontend.initializeGuards;
                      const coreSession = makeAggregateSession({
                        guards,
                        frontend,
                        sessionId,
                        runtime: sessionRuntime,
                        executeAggregateFrontendCommand: executeProps =>
                          executeAggregateFrontendCommand === null
                            ? Effect.fail(
                                new ZerospinError({
                                  code: 'aggregate-frontend-session-not-ready',
                                  message:
                                    'Command execution started before the aggregate replica was acquired',
                                }),
                              )
                            : executeAggregateFrontendCommand(executeProps),
                      });
                      yield* Effect.addFinalizer(() =>
                        Effect.sync(() => {
                          coreSession.store.setState({
                            sessionStatus: 'released',
                          });
                        }),
                      );
                      const session = makeBrowserSession({
                        session: coreSession,
                      });
                      const bootstrap =
                        yield* bootstrapAggregateFrontendSession({
                          aggregateVersion: frontend.aggregateVersion,
                          session: coreSession,
                          aggregateId,
                          apiUrl,
                          publishableKey,
                          systemName,
                          authenticationLock,
                          generateSignature: () =>
                            sessionRuntime.runPromise(
                              generateValidatedSignature().pipe(encodeRpc),
                            ),
                          backupWorker,
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

                      // 5 — retain push controls while moving registration to renewed session IDs.
                      const devtoolsEntry = {
                        session: coreSession,
                        getPushPaused: () =>
                          sessionRuntime.runPromise(
                            bootstrap.getPushPaused.pipe(encodeRpc),
                          ),
                        setPushPaused: (pushPausedProps: {
                          pushPaused: boolean;
                        }) =>
                          sessionRuntime.runPromise(
                            bootstrap
                              .setPushPaused(pushPausedProps)
                              .pipe(encodeRpc),
                          ),
                        pushNow: () =>
                          sessionRuntime.runPromise(
                            bootstrap.pushNow.pipe(encodeRpc),
                          ),
                      };
                      let registeredSessionId = coreSession.sessionId;
                      zerospinDevtoolsStore
                        .getState()
                        .addAggregateSession(devtoolsEntry);
                      const unsubscribe = coreSession.store.subscribe(state => {
                        if (state.sessionId === registeredSessionId) return;
                        zerospinDevtoolsStore
                          .getState()
                          .removeAggregateSession(registeredSessionId);
                        registeredSessionId = state.sessionId;
                        zerospinDevtoolsStore
                          .getState()
                          .addAggregateSession(devtoolsEntry);
                      });
                      yield* Effect.addFinalizer(() =>
                        Effect.sync(() => {
                          unsubscribe();
                          zerospinDevtoolsStore
                            .getState()
                            .removeAggregateSession(registeredSessionId);
                        }),
                      );
                      return {
                        selector,
                        registryEntry: {
                          session,
                          subscribe: (onStoreChange: () => void) =>
                            coreSession.store.subscribe(onStoreChange),
                          getState: () => coreSession.store.getState(),
                          getLiveQueryDb: () =>
                            getInitializedStateOrThrow({ session: coreSession })
                              .db,
                        } satisfies ISessionRegistryEntry,
                        systemId: bootstrap.systemId,
                        userId: bootstrap.userId,
                      };
                    }

                    // 4 — service sessions use the selected models and service version.
                    const coreSession = makeServiceSession({
                      frontend,
                      models: selector.models,
                      sessionId,
                    });
                    const session = {
                      coreSession,
                      frontend: coreSession.frontend,
                      models: coreSession.models,
                      get sessionId() {
                        return coreSession.sessionId;
                      },
                      onInitialized: coreSession.onInitialized,
                      store: coreSession.store,
                    };
                    const bootstrap = yield* bootstrapServiceFrontendSession({
                      serviceVersion: frontend.serviceVersion,
                      session: coreSession,
                      apiUrl,
                      publishableKey,
                      systemName,
                      authenticationLock,
                      generateSignature: () =>
                        sessionRuntime.runPromise(
                          generateValidatedSignature().pipe(encodeRpc),
                        ),
                      backupWorker,
                    }).pipe(
                      Effect.provide(
                        makeTelemetryLayer(
                          coreSession.store.getState().telemetryCollector,
                        ),
                      ),
                      Effect.provide(AsyncLive),
                    );

                    // 5 — follow service session ID changes and unregister when the scope closes.
                    zerospinDevtoolsStore.getState().addServiceSession({
                      session: coreSession,
                    });
                    let registeredSessionId = coreSession.sessionId;
                    const unsubscribe = coreSession.store.subscribe(state => {
                      if (state.sessionId === registeredSessionId) return;
                      zerospinDevtoolsStore
                        .getState()
                        .removeServiceSession(registeredSessionId);
                      registeredSessionId = state.sessionId;
                      zerospinDevtoolsStore.getState().addServiceSession({
                        session: coreSession,
                      });
                    });
                    yield* Effect.addFinalizer(() =>
                      Effect.sync(() => {
                        unsubscribe();
                        zerospinDevtoolsStore
                          .getState()
                          .removeServiceSession(registeredSessionId);
                      }),
                    );
                    return {
                      selector,
                      registryEntry: {
                        session,
                        subscribe: (onStoreChange: () => void) =>
                          coreSession.store.subscribe(onStoreChange),
                        getState: () => coreSession.store.getState(),
                        getLiveQueryDb: () => {
                          const state = coreSession.store.getState();
                          if (!state.isInitialized || state.db === null) {
                            throw new ZerospinError({
                              code: 'service-session-store-not-initialized',
                              message:
                                'Service session store is not initialized',
                            });
                          }
                          return state.db;
                        },
                      } satisfies ISessionRegistryEntry,
                      systemId: bootstrap.systemId,
                      userId: bootstrap.userId,
                    };
                  }),
                ),
                { concurrency: 'unbounded' },
              );

              // 6 — compare bootstrap systemId and userId before exposing any session.
              const firstInitializedSession = initializedSessions[0];
              if (firstInitializedSession === undefined) {
                return yield* new ZerospinError({
                  code: 'frontend-session-not-ready',
                  message: 'No selected frontend established an identity',
                });
              }
              const systemId = firstInitializedSession.systemId;
              const resolvedUserId = firstInitializedSession.userId;
              for (const initializedSession of initializedSessions) {
                if (
                  initializedSession.systemId !== systemId ||
                  initializedSession.userId !== resolvedUserId
                ) {
                  return yield* new ZerospinError({
                    code: 'frontend-session-identity-mismatch',
                    message:
                      'Selected frontends resolved to different identities',
                  });
                }
              }

              // 7 — publish all selector entries together; cancellation suppresses publication.
              yield* Effect.sync(() => {
                if (!cancelled) {
                  const nextSessions = new Map<object, ISessionRegistryEntry>();
                  for (const initializedSession of initializedSessions) {
                    nextSessions.set(
                      initializedSession.selector,
                      initializedSession.registryEntry,
                    );
                  }
                  setSessions(nextSessions);
                }
              });

              // 7 — retain acquired resources and DevTools finalizers until interruption.
              return yield* Effect.never;
            }),
          ).pipe(Effect.provideContext(application)),
      ).pipe(
        // 8 — clear the registry on typed failure and always release the page claim.
        Effect.catch(error =>
          Effect.sync(() => {
            if (!cancelled) {
              setSessions(new Map());
              setStartupError(error);
            }
          }),
        ),
        Effect.ensuring(Effect.sync(releasePageProviderOwner)),
      );

      const fiber = Effect.runFork(program);
      Effect.runSync(Scope.addFinalizer(sessionScope, Fiber.interrupt(fiber)));
      return () => {
        // 8 — interrupt scoped work on unmount or aggregate target changes.
        cancelled = true;
        setSessions(new Map());
        Effect.runFork(Scope.close(sessionScope, Exit.void));
        releasePageProviderOwner();
      };
    }, [aggregateIdsKey, providerRuntime]);

    // 9 — throw startup errors during render and gate children on registry size.
    const providerContext = useMemo(
      () =>
        providerRuntime === null
          ? null
          : {
              mountedFrontends,
              sessions,
              sessionRuntime: providerRuntime.runtime,
            },
      [sessions, providerRuntime],
    );

    if (startupError !== null) throw startupError;
    if (providerContext === null) return null;

    return (
      <ZerospinProviderContext.Provider value={providerContext}>
        {sessions.size === Object.keys(frontends).length ? children : null}
        <ZerospinDevtoolsLoader />
      </ZerospinProviderContext.Provider>
    );
  }

  return { systemName, authentication, frontends, Provider };
}
