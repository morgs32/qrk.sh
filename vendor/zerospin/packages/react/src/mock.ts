'use client';

import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IAccountId,
  IActorId,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import { applyFrontendState } from '@zerospin/core/session/applyFrontendState';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import useSWRImmutable from 'swr/immutable';
import { useStore } from 'zustand/react';

import { makeBrowserPartitionController } from './makeBrowserPartitionController';
import { makeBrowserSession } from './makeBrowserSession';
import type { IBrowserSession, IReactFrontend } from './types';

/*
 * 1. Capture identity and fixture props once for this mount.
 * 2. Create a real session without production browser infrastructure.
 * 3. Open, migrate, and seed one in-memory WASM SQLite database.
 * 4. Publish initialized state only while the provider is still mounted.
 * 5. Close the database exactly once on failure, late completion, or unmount.
 * 6. Render the supplied React frontend context after initialization.
 */
export function makeMockProvider<FRONTEND extends IFrontendController>(props: {
  reactFrontend: Pick<
    IReactFrontend<FRONTEND>,
    'frontend' | 'ReactContext' | 'sessionRuntime'
  >;
}) {
  const { reactFrontend } = props;

  return function MockProvider(providerProps: {
    children: ReactNode;
    partitionKey: string;
    accountId: IAccountId;
    actorId: IActorId;
    generationId: string;
    systemVersion: string;
    systemWorkerName: string;
    resources?: Partial<{
      [K in keyof InferFrontendModels<FRONTEND>]: readonly InferResource<
        InferFrontendModels<FRONTEND>[K]
      >[];
    }>;
  }) {
    const { children } = providerProps;
    const initializationPropsRef = useRef(providerProps);
    const isUnmountedRef = useRef(false);
    const releaseMockSessionRef = useRef<Effect.Effect<
      void,
      never,
      Async
    > | null>(null);

    // 2 — the mock keeps the normal browser-session hook surface, but creates
    // no config context, queue, websocket, SharedWorker, RPC, or DevTools entry.
    const browserPartitionController = useMemo(
      () =>
        makeBrowserPartitionController(
          initializationPropsRef.current.partitionKey,
          false,
        ),
      [],
    );
    const coreSession = useMemo(() => {
      const sessionId = reactFrontend.sessionRuntime.runSync(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        }),
      );
      return makeSession({
        frontend: reactFrontend.frontend,
        generateSignature: () =>
          Effect.fail(
            new ZerospinError({
              code: 'mock-session-remote-api-unsupported',
              message: 'Mock sessions do not support remote APIs',
            }),
          ),
        isSharedWorkerEnabled: false,
        runtime: reactFrontend.sessionRuntime,
        sessionId,
      });
    }, []);
    const session = useMemo(
      () =>
        makeBrowserSession({
          browserPartitionController,
          session: coreSession,
        }),
      [browserPartitionController, coreSession],
    );

    // 3 — applyFrontendState owns the one migration and the production insert
    // path. Fixture identity changes after this fetch begins are ignored.
    const { error: initializationError } = useSWRImmutable<
      {
        releaseMockSession: Effect.Effect<void, never, Async>;
        systemId: ISystemId;
      },
      IAnyError,
      IBrowserSession<FRONTEND>
    >(
      session,
      () => {
        const initializationProps = initializationPropsRef.current;
        return reactFrontend.sessionRuntime
          .runPromise(
            Effect.gen(function* () {
              const models = getFrontendDbModels(reactFrontend.frontend);
              const dbConfig = makeResourceDbConfig({
                models,
                otherTables: sessionRepoTables,
              });
              const schema = dbConfig.schema;
              const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
              const systemId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.system,
              });
              const releaseMockSession = makeAsync(
                () => db.$client.sqlite3.close(db.$client.db),
                ZerospinError.catch({
                  code: 'failed-to-close-mock-session-database',
                  message: 'Failed to close mock session database',
                }),
              ).pipe(Effect.asVoid, Effect.ignore);

              return yield* Effect.gen(function* () {
                const resources: IEncodedResourceShape[] = [];
                for (const modelResources of Object.values(
                  initializationProps.resources ?? {},
                )) {
                  if (modelResources !== undefined) {
                    const [firstResource] = modelResources;
                    if (firstResource !== undefined) {
                      const model =
                        reactFrontend.frontend.models[firstResource.modelName];
                      if (model === undefined) {
                        return yield* new ZerospinError({
                          code: 'mock-session-resource-model-not-found',
                          message: `Mock resource model ${firstResource.modelName} was not found`,
                        });
                      }
                      const encodedModelResources = yield* Schema.encode(
                        Schema.Array(
                          Schema.extend(
                            Schema.Struct({
                              id: makeAbbreviationIdSchema(model.abbreviation),
                              modelName: Schema.Literal(model.modelName),
                              createdAt: Schema.DateFromSelf,
                              updatedAt: Schema.DateFromSelf,
                              version: Schema.String,
                            }),
                            model.attributesSchema,
                          ),
                        ),
                      )(modelResources).pipe(
                        mapParseError({
                          code: 'mock-session-resource-encode-failed',
                          prefix: `Failed to encode mock ${firstResource.modelName} resources`,
                        }),
                      );
                      resources.push(...encodedModelResources);
                    }
                  }
                }

                yield* applyFrontendState({
                  db,
                  frontend: reactFrontend.frontend,
                  frontendVersion: reactFrontend.frontend.version,
                  accountId: initializationProps.accountId,
                  actorId: initializationProps.actorId,
                  systemId,
                  generationId: initializationProps.generationId,
                  systemVersion: initializationProps.systemVersion,
                  systemWorkerName: initializationProps.systemWorkerName,
                  frontendState: {
                    accountId: initializationProps.accountId,
                    accountName: reactFrontend.frontend.accountName,
                    actorId: initializationProps.actorId,
                    actorName: reactFrontend.frontend.actorName,
                    executedPushedCommands: [],
                    failedPushedCommands: [],
                    frontendIndex: 0,
                    frontendName: reactFrontend.frontend.frontendName,
                    generationId: initializationProps.generationId,
                    lastRebasedPushedCursor: null,
                    pushedCommands: [],
                    resources,
                    systemId,
                    systemVersion: initializationProps.systemVersion,
                    systemWorkerName: initializationProps.systemWorkerName,
                  },
                  models,
                  schema,
                });

                return {
                  db,
                  models,
                  releaseMockSession,
                  schema,
                  systemId,
                };
              }).pipe(Effect.tapError(() => releaseMockSession));
            }),
          )
          .then(data => {
            // 4 — a provider removed while WASM initializes owns no published
            // session; close its completed database immediately.
            if (isUnmountedRef.current) {
              reactFrontend.sessionRuntime.runFork(data.releaseMockSession);
              return data;
            }

            releaseMockSessionRef.current = data.releaseMockSession;
            coreSession.store.setState({
              accountId: initializationProps.accountId,
              accountName: reactFrontend.frontend.accountName,
              actorId: initializationProps.actorId,
              db: data.db,
              frontendIndex: 0,
              frontendName: reactFrontend.frontend.frontendName,
              frontendVersion: reactFrontend.frontend.version,
              generationId: initializationProps.generationId,
              isInitialized: true,
              lastRebasedPushedCursor: null,
              models: data.models,
              schema: data.schema,
              sessionId: coreSession.sessionId,
              systemId: data.systemId,
              systemVersion: initializationProps.systemVersion,
              systemWorkerName: initializationProps.systemWorkerName,
              vfsName: null,
              replicaIndex: null,
              workerState: {
                mode: 'direct',
                status: 'online',
                bootstrapSource: null,
                frontendIndex: 0,
                replicaIndex: null,
                databaseName: null,
                failure: null,
              },
            });
            return data;
          });
      },
      {
        shouldRetryOnError: false,
      },
    );

    const isInitialized = useStore(
      coreSession.store,
      state => state.isInitialized,
    );

    useEffect(() => {
      isUnmountedRef.current = false;

      return () => {
        isUnmountedRef.current = true;
        const releaseMockSession = releaseMockSessionRef.current;
        if (releaseMockSession !== null) {
          releaseMockSessionRef.current = null;
          // 5 — child live-query effects release in this unmount pass before
          // the single SQLite close runs in the following microtask.
          queueMicrotask(() => {
            reactFrontend.sessionRuntime.runFork(releaseMockSession);
          });
        }
      };
    }, []);

    if (initializationError) {
      throw initializationError;
    }

    if (!isInitialized) {
      return null;
    }

    // 6 — existing hooks consume the same browser-session context shape as the
    // production provider; unsupported remote work fails at its signature seam.
    return createElement(
      reactFrontend.ReactContext.Provider,
      { value: { session } },
      children,
    );
  };
}
