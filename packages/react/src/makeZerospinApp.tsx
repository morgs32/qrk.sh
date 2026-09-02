'use client';

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeSignature } from '@zerospin/core/authentication/makeSignature';
import type { IAuthenticationSignature } from '@zerospin/core/authentication/types';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeSession } from '@zerospin/core/session/makeSession';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { bootstrapAggregateFrontendSession } from '@zerospin/frontend/bootstrapAggregateFrontendSession';
import { bootstrapServiceFrontendSession } from '@zerospin/frontend/bootstrapServiceFrontendSession';
import { makeTelemetryLayer } from '@zerospin/logger';
import { acquireOpfsBackupWorker } from '@zerospin/opfs-backup-worker';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
} from '@zerospin/schema';
import { Effect, Redacted, Schema } from 'effect';

import { makeBrowserSession } from './makeBrowserSession';
import {
  resolveFrontendSourceSelection,
  type IFrontendSourceSelection,
  type ISignatureAtVersion,
  type ISourceSelectedFrontendController,
  type ISupportedDefinitionVersion,
} from './resolveFrontendSourceSelection';
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

export function makeZerospinApp<
  const SYSTEM_NAME extends string,
  const SIGNATURE extends IAuthenticationSignature,
  const AUTHENTICATION_VERSION extends
    | ISupportedDefinitionVersion<SIGNATURE>
    | undefined,
  const FRONTENDS extends Readonly<
    Record<string, IFrontendSourceSelection<IFrontendController>>
  >,
>(props: {
  systemName: SYSTEM_NAME;
  authentication: Readonly<{
    signature: SIGNATURE;
    version?: AUTHENTICATION_VERSION;
  }>;
  frontends: FRONTENDS & {
    readonly [FRONTEND_NAME in keyof FRONTENDS]: FRONTENDS[FRONTEND_NAME] extends {
      controller: infer FRONTEND extends IFrontendController;
    }
      ? FRONTEND['systemName'] extends SYSTEM_NAME
        ? FRONTEND['frontendName'] extends FRONTEND_NAME
          ? IFrontendSourceSelection<FRONTEND>
          : never
        : never
      : never;
  };
  runtime: ISessionProviderRuntime;
}) {
  const {
    authentication,
    frontends: sourceFrontends,
    runtime: sessionRuntime,
    systemName,
  } = props;
  const authenticationVersion =
    authentication.version ?? authentication.signature.version;
  const historicalAuthenticationDefinition =
    authenticationVersion === authentication.signature.version
      ? undefined
      : authentication.signature.historicalDefinitions.find(
          definition => definition.version === authenticationVersion,
        );
  if (
    authenticationVersion !== authentication.signature.version &&
    historicalAuthenticationDefinition === undefined
  ) {
    throw new Error(
      `makeZerospinApp: authentication signature version "${authenticationVersion}" is unavailable`,
    );
  }
  const selectedAuthenticationSignature: IAuthenticationSignature =
    historicalAuthenticationDefinition === undefined
      ? authentication.signature
      : Reflect.apply(makeSignature, undefined, [
          {
            version: historicalAuthenticationDefinition.version,
            schema: historicalAuthenticationDefinition.schema,
          },
          [],
        ]);

  const frontends: {
    readonly [FRONTEND_NAME in keyof FRONTENDS]: Readonly<{
      frontend: ISourceSelectedFrontendController<FRONTENDS[FRONTEND_NAME]>;
    }>;
  } = Object.create(null);
  for (const [frontendName, entry] of Object.entries(sourceFrontends)) {
    Reflect.set(frontends, frontendName, {
      frontend: resolveFrontendSourceSelection({
        entry,
        configuredFrontendName: frontendName,
        systemName,
      }),
    });
  }

  const mountedFrontends = Object.fromEntries(
    Object.entries(frontends).map(([frontendName, selector]) => [
      frontendName,
      { frontend: selector.frontend },
    ]),
  );

  function Provider(providerProps: {
    generateSignature: ISignatureFactory &
      (() => Effect.Effect<
        Schema.Schema.Type<
          ISignatureAtVersion<
            SIGNATURE,
            AUTHENTICATION_VERSION extends string
              ? AUTHENTICATION_VERSION
              : SIGNATURE['version']
          >['schema']
        >,
        IAnyError
      >);
    aggregateIds: {
      readonly [ENTRY in FRONTENDS[keyof FRONTENDS] as ISourceSelectedFrontendController<ENTRY> extends {
        kind: 'aggregate';
        aggregateName: infer AGGREGATE_NAME extends string;
      }
        ? AGGREGATE_NAME
        : never]: IAggregateId;
    };
    children: ReactNode;
  }) {
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

    useEffect(() => {
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

      const program = Effect.scoped(
        Effect.gen(function* () {
          const selectedFrontends = Object.entries(frontends);
          if (selectedFrontends.length === 0) {
            yield* Effect.sync(() => {
              if (!cancelled) {
                setSessions(new Map());
              }
            });
            return yield* Effect.never;
          }

          const authenticationLock = makeAuthenticationLock({
            signature: selectedAuthenticationSignature,
          });
          const generateValidatedSignature = () =>
            generateSignatureRef.current().pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  selectedAuthenticationSignature.schema,
                ),
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
          const backupWorker = yield* acquireOpfsBackupWorker();

          const initializedSessions = yield* Effect.all(
            selectedFrontends.map(([frontendName, selector]) =>
              Effect.gen(function* () {
                const frontend = selector.frontend;
                const sessionId = yield* makeIdFromAbbreviation({
                  abbreviation: coreAbbreviations.session,
                });
                if (frontend.kind === 'aggregate') {
                  const aggregateId = yield* Schema.decodeUnknownEffect(
                    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
                  )(
                    Reflect.get(
                      JSON.parse(aggregateIdsKey),
                      frontend.aggregateName,
                    ),
                  ).pipe(
                    Effect.mapError(
                      () =>
                        new ZerospinError({
                          code: 'aggregate-target-required',
                          message: `Provider requires aggregateIds.${frontend.aggregateName} for frontend "${frontendName}"`,
                        }),
                    ),
                  );
                  let executeAggregateFrontendCommand: NonNullable<
                    Parameters<
                      typeof makeSession
                    >[0]['executeAggregateFrontendCommand']
                  > | null = null;
                  const coreSession = makeSession({
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
                  const session = makeBrowserSession({ session: coreSession });
                  const bootstrap = yield* bootstrapAggregateFrontendSession({
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
                  zerospinDevtoolsStore.getState().addAggregateSession({
                    session: coreSession,
                    getPushPaused: () =>
                      sessionRuntime.runPromise(
                        bootstrap.getPushPaused.pipe(encodeRpc),
                      ),
                    setPushPaused: pushPausedProps =>
                      sessionRuntime.runPromise(
                        bootstrap
                          .setPushPaused(pushPausedProps)
                          .pipe(encodeRpc),
                      ),
                    pushNow: () =>
                      sessionRuntime.runPromise(
                        bootstrap.pushNow.pipe(encodeRpc),
                      ),
                  });
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      zerospinDevtoolsStore
                        .getState()
                        .removeAggregateSession(session.sessionId);
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
                        getInitializedStateOrThrow({ session: coreSession }).db,
                    } satisfies ISessionRegistryEntry,
                    systemId: bootstrap.systemId,
                    userId: bootstrap.userId,
                  };
                }

                const coreSession = makeServiceSession({
                  frontend,
                  sessionId,
                });
                const session = {
                  coreSession,
                  frontend: coreSession.frontend,
                  sessionId: coreSession.sessionId,
                  onInitialized: coreSession.onInitialized,
                  store: coreSession.store,
                };
                const bootstrap = yield* bootstrapServiceFrontendSession({
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
                zerospinDevtoolsStore.getState().addServiceSession({
                  session: coreSession,
                });
                yield* Effect.addFinalizer(() =>
                  Effect.sync(() => {
                    zerospinDevtoolsStore
                      .getState()
                      .removeServiceSession(coreSession.sessionId);
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
                          message: 'Service session store is not initialized',
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
                message: 'Selected frontends resolved to different identities',
              });
            }
          }

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
          return yield* Effect.never;
        }),
      ).pipe(
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

      const fiber = sessionRuntime.runFork(program);
      return () => {
        cancelled = true;
        setSessions(new Map());
        fiber.interruptUnsafe();
        releasePageProviderOwner();
      };
    }, [aggregateIdsKey]);

    const providerContext = useMemo(
      () => ({ mountedFrontends, sessions, sessionRuntime }),
      [sessions],
    );

    if (startupError !== null) throw startupError;

    return (
      <ZerospinProviderContext.Provider value={providerContext}>
        {sessions.size === Object.keys(frontends).length ? children : null}
        <ZerospinDevtoolsLoader />
      </ZerospinProviderContext.Provider>
    );
  }

  return { frontends, Provider };
}
