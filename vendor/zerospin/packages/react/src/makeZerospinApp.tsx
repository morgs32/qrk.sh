'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ContextType,
  type ReactNode,
} from 'react';

import {
  acquireBackupWorker,
  type IBackupWorker,
} from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { AssertContractMutationsInModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import type { IAnyContractBindings } from '@zerospin/core/contracts/types';
import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import type {
  IAnyAggregateFrontendController,
  IAnyFrontendController,
} from '@zerospin/core/frontendController/types';
import type {
  IAnyModels,
  IAssertValidModels,
  IModelReplica,
} from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import type { ISystem } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { bootstrapAggregateFrontendSession } from '@zerospin/frontend/bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from '@zerospin/frontend/bootstrapServiceFrontendSession';
import { makeTelemetryLayer } from '@zerospin/logger';
import {
  makeIdFromAbbreviation,
  type CuidFactory,
  type ITypeError,
} from '@zerospin/schema';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Redacted,
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

/** Shared application resources; frontend components own their mounted sessions. */
export function makeZerospinApp<SYSTEM, APP_SERVICES = never>(props: {
  systemName: SYSTEM extends { name: infer NAME extends string } ? NAME : never;
  layer: Layer.Layer<APP_SERVICES | PublishableKey | ZerospinApiUrl, IAnyError>;
  devtools?: {
    load?: boolean;
    defaultOpen?: boolean;
  };
}) {
  const { systemName, layer: applicationLayer, devtools } = props;
  const AppContext = createContext<{
    runtime: ISessionProviderRuntime<APP_SERVICES>;
    scope: Scope.Closeable;
    backupWorker: Effect.Effect<IBackupWorker, IAnyError>;
    mounts: Map<string, { released: boolean; done: Promise<void> }>;
    releases: Set<Promise<void>>;
    systemId: string | undefined;
  } | null>(null);

  function Provider({ children }: { children: ReactNode }) {
    if (
      Object.getPrototypeOf(applicationLayer) !==
      Object.getPrototypeOf(Layer.empty)
    ) {
      throw new ZerospinError({
        code: 'zerospin-app-effect-runtime-mismatch',
        message:
          'The application layer was created by a different Effect runtime than Zerospin React. Ensure the app and Zerospin resolve to the same Effect installation, then rebuild.',
      });
    }
    const parent = useContext(ZerospinProviderContext);
    if (parent !== null) {
      throw new Error(
        'ZerospinApp.Provider cannot be mounted inside another ZerospinApp.Provider.',
      );
    }
    const [app, setApp] = useState<ContextType<typeof AppContext>>(null);
    const [startupError, setStartupError] = useState<unknown>(null);
    useEffect(() => {
      const owner = {};
      if (Reflect.get(globalThis, pageProviderOwnerKey) !== undefined) {
        setStartupError(
          new ZerospinError({
            code: 'zerospin-app-provider-already-mounted',
            message: 'Exactly one ZerospinApp.Provider may be active in a page',
          }),
        );
        return;
      }
      Reflect.set(globalThis, pageProviderOwnerKey, owner);
      const scope = Effect.runSync(Scope.make());
      const backupScope = Effect.runSync(Scope.make());
      const runtime = ManagedRuntime.make(
        Layer.mergeAll(
          NanoIdFactory,
          UlidMonotonicFactory,
          AsyncLive,
          applicationLayer,
        ),
      );
      // Cache the acquisition fiber, not a caller's wait: one frontend may unmount
      // while its sibling still awaits the app-owned connection.
      const backup = Effect.runSync(
        Effect.cached(
          Effect.suspend(() => acquireBackupWorker()).pipe(
            Scope.provide(backupScope),
            Effect.forkIn(backupScope),
          ),
        ),
      );
      const nextApp: NonNullable<ContextType<typeof AppContext>> = {
        runtime,
        scope,
        backupWorker: backup.pipe(Effect.flatMap(Fiber.join)),
        mounts: new Map(),
        releases: new Set(),
        systemId: undefined,
      };
      let cancelled = false;
      const startup = Effect.runFork(
        runtime.contextEffect.pipe(
          Effect.matchCause({
            onSuccess: () => {
              if (!cancelled) setApp(nextApp);
            },
            onFailure: cause => {
              if (!cancelled) setStartupError(Cause.squash(cause));
            },
          }),
        ),
      );
      return () => {
        cancelled = true;
        setApp(null);
        // Frontends finish before the backup connection and application services.
        Effect.runFork(
          Fiber.interrupt(startup).pipe(
            Effect.andThen(Scope.close(scope, Exit.void)),
            // Scope.close does not await a close already in progress.
            Effect.ensuring(
              Effect.promise(() => Promise.all(nextApp.releases)),
            ),
            Effect.ensuring(Scope.close(backupScope, Exit.void)),
            Effect.ensuring(runtime.disposeEffect),
          ),
        );
        if (Reflect.get(globalThis, pageProviderOwnerKey) === owner) {
          Reflect.deleteProperty(globalThis, pageProviderOwnerKey);
        }
      };
    }, []);
    const context = useMemo(
      () =>
        app === null
          ? null
          : {
              sessions: new Map<object, ISessionRegistryEntry>(),
              sessionRuntime: app.runtime,
            },
      [app],
    );
    if (startupError !== null) throw startupError;
    if (app === null || context === null) return null;
    return (
      <AppContext.Provider value={app}>
        <ZerospinProviderContext.Provider value={context}>
          {children}
          <ZerospinDevtoolsLoader
            load={devtools?.load === true}
            defaultOpen={devtools?.defaultOpen === true}
          />
        </ZerospinProviderContext.Provider>
      </AppContext.Provider>
    );
  }

  function makeFrontend<
    SIGNATURE,
    const FRONTEND extends IAnyFrontendController,
  >(
    definition: FRONTEND,
  ): ((props: {
    children: ReactNode;
    generateSignature: () => Effect.Effect<SIGNATURE, IAnyError>;
  }) => ReactNode) &
    Readonly<{ frontend: FRONTEND; models: FRONTEND['models'] }> {
    // Input validation retains layer requirements; the mounted implementation
    // erases the type-only requirement marker while the selector stays exact.
    let frontend: IAnyFrontendController<
      | APP_SERVICES
      | Async
      | CuidFactory
      | MonotonicFactory
      | PublishableKey
      | ZerospinApiUrl
    >;
    if (definition.kind === 'aggregate') {
      const aggregate: IAnyAggregateFrontendController = definition;
      const { __initializeRequirements: _requirements, ...runtimeFrontend } =
        aggregate;
      frontend = runtimeFrontend;
    } else {
      frontend = definition;
    }
    if (frontend.systemName !== systemName) {
      throw new Error(
        `Frontend "${frontend.name}" belongs to system "${frontend.systemName}", not "${systemName}".`,
      );
    }
    function Frontend({
      children,
      generateSignature,
    }: {
      children: ReactNode;
      generateSignature: () => Effect.Effect<SIGNATURE, IAnyError>;
    }) {
      const app = useContext(AppContext);
      const parent = useContext(ZerospinProviderContext);
      if (app === null || parent === null) {
        throw new Error(
          `Frontend "${frontend.name}" requires its matching ZerospinApp.Provider.`,
        );
      }
      const generateSignatureRef = useRef(generateSignature);
      generateSignatureRef.current = generateSignature;
      const [entry, setEntry] = useState<ISessionRegistryEntry | null>(null);
      const [startupError, setStartupError] = useState<unknown>(null);
      useEffect(() => {
        const frontendName = frontend.name;
        const previous = app.mounts.get(frontendName);
        if (previous !== undefined && !previous.released) {
          setStartupError(
            new ZerospinError({
              code: 'frontend-already-mounted',
              message: `Frontend "${frontendName}" already has a mounted owner in this app.`,
            }),
          );
          return;
        }
        const completion = Promise.withResolvers<void>();
        const mount = { released: false, done: completion.promise };
        app.mounts.set(frontendName, mount);
        const sessionScope = Effect.runSync(Scope.fork(app.scope));
        app.releases.add(completion.promise);
        // Registered before session resources so completion follows their finalizers.
        Effect.runSync(
          Scope.addFinalizer(
            sessionScope,
            (previous === undefined
              ? Effect.void
              : Effect.promise(() => previous.done)
            ).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  if (app.mounts.get(frontendName) === mount) {
                    app.mounts.delete(frontendName);
                  }
                  app.releases.delete(completion.promise);
                  completion.resolve();
                }),
              ),
            ),
          ),
        );

        const sessionRuntime = app.runtime;
        let cancelled = false;
        setEntry(null);
        setStartupError(null);
        const program = Effect.gen(function* () {
          // A keyed replacement waits for the old owner's asynchronous cleanup.
          if (previous !== undefined) {
            yield* Effect.promise(() => previous.done);
          }
          const application = yield* sessionRuntime.contextEffect;
          return yield* Effect.gen(function* () {
            const apiUrl = yield* ZerospinApiUrl;
            const publishableKey = Redacted.value(yield* PublishableKey);
            const backupWorker = yield* app.backupWorker;
            const initialized = yield* Effect.gen(function* () {
              const sessionId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.session,
              });
              const generateValidatedSignature = () =>
                Effect.suspend(() => {
                  const generateSignature = generateSignatureRef.current;
                  if (generateSignature === undefined) {
                    return new ZerospinError({
                      code: 'frontend-signature-missing',
                      message: `Missing signature generator for ${frontendName}`,
                    });
                  }
                  return generateSignature();
                });

              if (frontend.kind === 'aggregate') {
                // 4 — validate the aggregate ID; commands fail until bootstrap binds execution.
                let executeAggregateFrontendCommand: NonNullable<
                  Parameters<
                    typeof makeAggregateSession
                  >[0]['executeAggregateFrontendCommand']
                > | null = null;
                const guards = yield* initializeFrontendGuards(frontend);
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
                const bootstrap = yield* bootstrapAggregateFrontendSession({
                  aggregateVersion: frontend.aggregateVersion,
                  session: coreSession,
                  apiUrl,
                  publishableKey,
                  systemName,
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
                  setPushPaused: (pushPausedProps: { pushPaused: boolean }) =>
                    sessionRuntime.runPromise(
                      bootstrap.setPushPaused(pushPausedProps).pipe(encodeRpc),
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
                  registryEntry: {
                    session,
                    subscribe: (onStoreChange: () => void) =>
                      coreSession.store.subscribe(onStoreChange),
                    getState: () => coreSession.store.getState(),
                    getLiveQueryDb: () =>
                      getInitializedStateOrThrow({ session: coreSession }).db,
                  } satisfies ISessionRegistryEntry,
                  systemId: bootstrap.systemId,
                };
              }

              // 4 — service sessions use the selected models and service version.
              const coreSession = makeServiceSession({
                frontend,
                models: frontend.models,
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
                        message: 'Service session store is not initialized',
                      });
                    }
                    return state.db;
                  },
                } satisfies ISessionRegistryEntry,
                systemId: bootstrap.systemId,
              };
            });
            if (
              app.systemId !== undefined &&
              app.systemId !== initialized.systemId
            ) {
              return yield* new ZerospinError({
                code: 'frontend-session-identity-mismatch',
                message: 'Mounted frontends resolved to different systems',
              });
            }
            app.systemId = initialized.systemId;
            if (!cancelled) setEntry(initialized.registryEntry);
            return yield* Effect.never;
          }).pipe(Effect.provideContext(application));
        }).pipe(
          Scope.provide(sessionScope),
          Effect.catchCause(cause =>
            Effect.sync(() => {
              if (!cancelled) setStartupError(Cause.squash(cause));
            }),
          ),
        );
        const fiber = Effect.runFork(program);
        Effect.runSync(
          Scope.addFinalizer(sessionScope, Fiber.interrupt(fiber)),
        );
        return () => {
          cancelled = true;
          mount.released = true;
          setEntry(null);
          Effect.runFork(Scope.close(sessionScope, Exit.void));
        };
      }, [app]);
      const context = useMemo(
        () =>
          entry === null
            ? null
            : {
                sessions: new Map([...parent.sessions, [selector, entry]]),
                sessionRuntime: app.runtime,
              },
        [entry, parent, app],
      );
      if (startupError !== null) throw startupError;
      if (context === null) return null;
      return (
        <ZerospinProviderContext.Provider value={context}>
          {children}
        </ZerospinProviderContext.Provider>
      );
    }
    const selector = Object.assign(Frontend, {
      frontend: definition,
      models: definition.models,
    });
    return selector;
  }
  type Aggregates =
    SYSTEM extends ISystem<infer A, infer _S, infer _N, infer _R> ? A : never;
  type Services =
    SYSTEM extends ISystem<infer _A, infer S, infer _N, infer _R> ? S : never;
  type AppRequirements =
    | APP_SERVICES
    | Async
    | CuidFactory
    | MonotonicFactory
    | PublishableKey
    | ZerospinApiUrl;

  function makeAggregateFrontend<
    const NAME extends keyof Aggregates & string,
    const VERSION extends keyof Aggregates[NAME] & string,
    const FRONTEND_NAME extends string,
    const MODELS extends IAnyModels,
    const CONTRACTS extends IAnyContractBindings,
    LAYER_SERVICES = never,
    LAYER_REQUIREMENTS extends AppRequirements = never,
    GUARD_SERVICES = never,
    GUARD_REQUIREMENTS extends AppRequirements = never,
  >(
    props: {
      aggregateName: NAME;
      aggregateVersion: VERSION;
      name: FRONTEND_NAME;
      authenticationSchema: Aggregates[NAME][VERSION]['authentication']['authenticationSchema'];
      models: MODELS &
        IAssertValidModels<NoInfer<MODELS>> & {
          [K in keyof MODELS]: K extends keyof Aggregates[NAME][VERSION]['models']
            ? Aggregates[NAME][VERSION]['models'][K]
            : never;
        };
      contracts: CONTRACTS & {
        [K in keyof CONTRACTS &
          string]: K extends CONTRACTS[K]['contract']['commandName']
          ? CONTRACTS[K] & {
              contract: AssertContractMutationsInModels<
                CONTRACTS[K]['contract'],
                NoInfer<MODELS>
              >;
              guard?: never;
            }
          : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
      } & NoInfer<
          Partial<{
            [K in keyof Aggregates[NAME][VERSION]['contracts']]: {
              contract: Aggregates[NAME][VERSION]['contracts'][K]['contract'];
            };
          }> &
            Record<
              Exclude<
                keyof CONTRACTS,
                keyof Aggregates[NAME][VERSION]['contracts']
              >,
              never
            >
        >;
      layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
      guardLayer?: (props: {
        db: Readonly<
          Pick<
            IDb<IResourceDbConfig<NoInfer<MODELS>, Record<never, never>>>,
            'query'
          >
        >;
        authentication: NoInfer<
          Aggregates[NAME][VERSION]['authentication']['authenticationSchema']['Type']
        > | null;
      }) => Layer.Layer<
        | GUARD_SERVICES
        | NoInfer<
            Exclude<
              Effect.Services<
                ReturnType<
                  NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
                >
              >,
              AppRequirements | LAYER_SERVICES
            >
          >,
        IAnyError,
        GUARD_REQUIREMENTS
      >;
    } & NoInfer<
      Exclude<
        Effect.Services<
          ReturnType<
            NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
          >
        >,
        AppRequirements | LAYER_SERVICES
      > extends never
        ? unknown
        : { guardLayer: unknown }
    >,
  ) {
    const frontend = makeFrontendController<
      typeof systemName,
      NAME,
      VERSION,
      FRONTEND_NAME,
      CONTRACTS,
      MODELS,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS,
      Aggregates[NAME][VERSION]['authentication']['authenticationSchema'],
      never,
      AppRequirements
    >({ ...props, systemName });
    const {
      guardLayer: _guardLayer,
      __initializeRequirements: _initializationRequirements,
      ...controller
    } = frontend;
    const selected = {
      ...controller,
      ...(props.guardLayer === undefined
        ? {}
        : { guardLayer: props.guardLayer }),
    };
    return makeFrontend<
      Aggregates[NAME][VERSION]['authentication']['signatureSchema']['Type'],
      typeof selected & {
        readonly __initializeRequirements?:
          | LAYER_REQUIREMENTS
          | GUARD_REQUIREMENTS
          | Exclude<
              Effect.Services<
                ReturnType<
                  NonNullable<CONTRACTS[keyof CONTRACTS]['contract']['guard']>
                >
              >,
              LAYER_SERVICES | GUARD_SERVICES
            >
          | Scope.Scope;
      }
    >(selected);
  }

  function makeServiceFrontend<
    const NAME extends keyof Services & string,
    const VERSION extends keyof Services[NAME] & string,
    const FRONTEND_NAME extends string,
    const MODELS extends IAnyModels,
  >(props: {
    serviceName: NAME;
    serviceVersion: VERSION;
    name: FRONTEND_NAME;
    authenticationSchema: Services[NAME][VERSION]['authentication']['authenticationSchema'];
    models: MODELS &
      IAssertValidModels<NoInfer<MODELS>> & {
        [K in keyof MODELS]: K extends keyof Services[NAME][VERSION]['models']
          ? Services[NAME][VERSION]['models'][K]
          : never;
      } & {
        [K in keyof MODELS]: MODELS[K] extends IModelReplica
          ? ITypeError<`Service frontend model "${MODELS[K]['modelName']}" must be authoritative, not a replica`>
          : MODELS[K];
      };
  }) {
    const frontend = makeFrontendController<
      typeof systemName,
      NAME,
      VERSION,
      FRONTEND_NAME,
      MODELS,
      Services[NAME][VERSION]['authentication']['authenticationSchema']
    >({ ...props, systemName });
    return makeFrontend<
      Services[NAME][VERSION]['authentication']['signatureSchema']['Type'],
      typeof frontend
    >(frontend);
  }
  return {
    systemName,
    makeAggregateFrontend,
    makeServiceFrontend,
    Provider,
  };
}
