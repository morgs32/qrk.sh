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
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeSession } from '@zerospin/core/session/makeSession';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { makeTelemetryLayer } from '@zerospin/logger';
import { acquireUserPartitionRepo } from '@zerospin/shared-worker/acquireUserPartitionRepo';
import { Effect, Fiber, Schema } from 'effect';

import { bootstrapBrowserServiceSession } from './bootstrapBrowserServiceSession';
import { bootstrapBrowserSession } from './bootstrapBrowserSession';
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
          const authenticationLock = yield* makeAuthenticationLock({
            signature: selectedAuthenticationSignature,
          });
          const generateValidatedSignature = () =>
            generateSignatureRef.current().pipe(
              Effect.flatMap(
                Schema.decodeUnknown(selectedAuthenticationSignature.schema),
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
          const sharedWorkerClient = yield* Effect.acquireRelease(
            acquireUserPartitionRepo({
              systemName,
              authenticationLock,
              generateSignature: () =>
                sessionRuntime.runPromise(
                  generateValidatedSignature().pipe(encodeRpc),
                ),
            }),
            client => client.release,
          );
          const {
            systemId,
            userId: resolvedUserId,
            mode: acquisitionMode,
          } = sharedWorkerClient;
          const sharedWorkerDiagnosticsId = globalThis.crypto.randomUUID();
          yield* Effect.sync(() => {
            zerospinDevtoolsStore.getState().addSharedWorkerRootDiagnostics({
              id: sharedWorkerDiagnosticsId,
              systemId,
              userId: resolvedUserId,
              mode: acquisitionMode,
              listAggregateFrontendReplicas: () =>
                sharedWorkerClient.api.listAggregateFrontendReplicas(),
              listServiceFrontendReplicas: () =>
                sharedWorkerClient.api.listServiceFrontendReplicas(),
              getPushPaused: target =>
                sharedWorkerClient.api.getPushPaused(target),
              setPushPaused: target =>
                sharedWorkerClient.api.setPushPaused(target),
              pushNow: target => sharedWorkerClient.api.pushNow(target),
            });
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              zerospinDevtoolsStore
                .getState()
                .removeSharedWorkerRootDiagnostics(sharedWorkerDiagnosticsId);
            }),
          );

          const initializedSessions: readonly (readonly [
            object,
            ISessionRegistryEntry,
          ])[] = yield* Effect.all(
            Object.entries(frontends).map(([frontendName, selector]) =>
              Effect.gen(function* () {
                const frontend = selector.frontend;
                const sessionId = yield* makeIdFromAbbreviation({
                  abbreviation: coreAbbreviations.session,
                });
                if (frontend.kind === 'aggregate') {
                  const aggregateId = yield* Schema.decodeUnknown(
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
                  let stageAggregateFrontendCommand: NonNullable<
                    Parameters<
                      typeof makeSession
                    >[0]['stageAggregateFrontendCommand']
                  > | null = null;
                  const coreSession = makeSession({
                    frontend,
                    sessionId,
                    runtime: sessionRuntime,
                    stageAggregateFrontendCommand: stageProps =>
                      stageAggregateFrontendCommand === null
                        ? Effect.fail(
                            new ZerospinError({
                              code: 'shared-worker-session-not-ready',
                              message:
                                'Command staging started before the aggregate replica was acquired',
                            }),
                          )
                        : stageAggregateFrontendCommand(stageProps),
                  });
                  const session = makeBrowserSession({ session: coreSession });
                  const bootstrap = yield* Effect.acquireRelease(
                    bootstrapBrowserSession({
                      session: coreSession,
                      aggregateId,
                      userId: resolvedUserId,
                      systemId,
                      mode: acquisitionMode,
                      userReplicaApi: sharedWorkerClient.api,
                    }).pipe(
                      Effect.provide(
                        makeTelemetryLayer(
                          coreSession.store.getState().telemetryCollector,
                        ),
                      ),
                      Effect.provide(AsyncLive),
                    ),
                    data => data.releaseBrowserSession,
                  );
                  stageAggregateFrontendCommand =
                    bootstrap.stageAggregateFrontendCommand;
                  zerospinDevtoolsStore.getState().addAggregateSession({
                    session: coreSession,
                  });
                  yield* Effect.addFinalizer(() =>
                    Effect.sync(() => {
                      zerospinDevtoolsStore
                        .getState()
                        .removeAggregateSession(session.sessionId);
                    }),
                  );
                  return [
                    selector,
                    {
                      session,
                      subscribe: (onStoreChange: () => void) =>
                        coreSession.store.subscribe(onStoreChange),
                      getState: () => coreSession.store.getState(),
                      getLiveQueryDb: () =>
                        getInitializedStateOrThrow({ session: coreSession }).db,
                    } satisfies ISessionRegistryEntry,
                  ] satisfies readonly [object, ISessionRegistryEntry];
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
                yield* Effect.acquireRelease(
                  bootstrapBrowserServiceSession({
                    session: coreSession,
                    userId: resolvedUserId,
                    systemId,
                    mode: acquisitionMode,
                    userReplicaApi: sharedWorkerClient.api,
                  }).pipe(
                    Effect.provide(
                      makeTelemetryLayer(
                        coreSession.store.getState().telemetryCollector,
                      ),
                    ),
                    Effect.provide(AsyncLive),
                  ),
                  data => data.releaseBrowserSession,
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
                return [
                  selector,
                  {
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
                ] satisfies readonly [object, ISessionRegistryEntry];
              }),
            ),
            { concurrency: 'unbounded' },
          );

          yield* Effect.sync(() => {
            if (!cancelled) {
              setSessions(new Map(initializedSessions));
            }
          });
          return yield* Effect.never;
        }),
      ).pipe(
        Effect.catchAll(error =>
          Effect.sync(() => {
            if (!cancelled) setStartupError(error);
          }),
        ),
        Effect.ensuring(Effect.sync(releasePageProviderOwner)),
      );

      const fiber = sessionRuntime.runFork(program);
      return () => {
        cancelled = true;
        setSessions(new Map());
        void sessionRuntime.runPromise(Fiber.interrupt(fiber));
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
