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
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type {
  IAggregateFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import type {
  IAggregateId,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
} from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import useSWRImmutable from 'swr/immutable';
import { useStore } from 'zustand/react';

import { makeBrowserSession } from './makeBrowserSession';
import type { IBrowserSession, ISessionProviderRuntime } from './types';
import { ZerospinProviderContext } from './ZerospinProviderContext';

/*
 * 1. Capture identity and fixture props once for this mount.
 * 2. Create a real session without production browser infrastructure.
 * 3. Open, provision, and seed one in-memory WASM SQLite database.
 * 4. Publish initialized state only while the provider is still mounted.
 * 5. Close the database exactly once on failure, late completion, or unmount.
 * 6. Render the supplied frontend selector through the session registry.
 */
export function makeMockProvider<
  FRONTEND extends IAggregateFrontendController,
>(props: {
  frontend: Readonly<{ frontend: FRONTEND }>;
  runtime: ISessionProviderRuntime;
}) {
  const { frontend: selector, runtime: sessionRuntime } = props;

  return function MockProvider(providerProps: {
    children: ReactNode;
    generateSignature: ISignatureFactory;
    userId?: string;
    aggregateIds: {
      readonly [AGGREGATE_NAME in FRONTEND['aggregateName']]: IAggregateId;
    };
    systemVersion: string;
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
    // no queue, websocket, OPFS backup worker, RPC, or DevTools entry.
    const coreSession = useMemo(() => {
      const sessionId = sessionRuntime.runSync(
        makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        }),
      );
      return makeSession({
        frontend: selector.frontend,
        runtime: sessionRuntime,
        sessionId,
      });
    }, []);
    const session = useMemo(
      () =>
        makeBrowserSession({
          session: coreSession,
        }),
      [coreSession],
    );
    const registryEntry = useMemo(
      () => ({
        session,
        subscribe: (onStoreChange: () => void) =>
          coreSession.store.subscribe(onStoreChange),
        getState: () => coreSession.store.getState(),
        getLiveQueryDb: () =>
          getInitializedStateOrThrow({ session: coreSession }).db,
      }),
      [coreSession, session],
    );
    const providerContext = useMemo(
      () => ({
        mountedFrontends: {
          [selector.frontend.frontendName]: selector,
        },
        sessions: new Map([[selector, registryEntry]]),
        sessionRuntime,
      }),
      [registryEntry],
    );

    // 3 — applyAggregateFrontendState owns provisioning and the production insert
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
        return sessionRuntime
          .runPromise(
            Effect.gen(function* () {
              if (initializationProps.userId === undefined) {
                return yield* new ZerospinError({
                  code: 'mock-session-user-id-required',
                  message:
                    'MockProvider requires userId because it does not simulate authentication',
                });
              }
              const userId = initializationProps.userId;
              const aggregateId = yield* Schema.decodeUnknownEffect(
                makeAbbreviationIdSchema(coreAbbreviations.aggregate),
              )(
                Reflect.get(
                  initializationProps.aggregateIds,
                  selector.frontend.aggregateName,
                ),
              ).pipe(
                mapParseError({
                  code: 'mock-session-aggregate-id-invalid',
                  prefix: `MockProvider requires aggregateIds.${selector.frontend.aggregateName}`,
                }),
              );
              const models = getFrontendDbModels(selector.frontend);
              const dbConfig = makeResourceDbConfig({
                models,
                otherTables: sessionRepoTables,
              });
              const schema = dbConfig.schema;
              const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
              const systemId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.system,
              });
              const aggregateFrontendLockKey =
                yield* makeAggregateFrontendLockKey(
                  makeFrontendControllerSpec(selector.frontend)
                    .aggregateFrontendLock,
                );
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
                        selector.frontend.models[firstResource.modelName];
                      if (model === undefined) {
                        return yield* new ZerospinError({
                          code: 'mock-session-resource-model-not-found',
                          message: `Mock resource model ${firstResource.modelName} was not found`,
                        });
                      }
                      const encodedModelResources = yield* Schema.encodeEffect(
                        Schema.Array(
                          Schema.Struct({
                            id: makeAbbreviationIdSchema(model.abbreviation),
                            modelName: Schema.Literal(model.modelName),
                            createdAt: Schema.Date,
                            updatedAt: Schema.Date,
                            version: Schema.String,
                            ...model.attributesSchema.fields,
                          }),
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

                yield* applyAggregateFrontendState({
                  db,
                  frontend: selector.frontend,
                  sessionId: coreSession.sessionId,
                  aggregateId,
                  userId,
                  systemId,
                  frontendState: {
                    aggregateId,
                    aggregateName: selector.frontend.aggregateName,
                    userId,
                    aggregateIndex: 0,
                    frontendIndex: 0,
                    frontendName: selector.frontend.frontendName,
                    pushIndex: 0,
                    resolvedPushIndexes: [],
                    resources,
                    systemId,
                    systemVersion: initializationProps.systemVersion,
                  },
                  models,
                  pushedCommands: [],
                });

                return {
                  aggregateId,
                  db,
                  aggregateFrontendLockKey,
                  models,
                  releaseMockSession,
                  schema,
                  systemId,
                  systemVersion: initializationProps.systemVersion,
                  userId,
                };
              }).pipe(Effect.tapError(() => releaseMockSession));
            }),
          )
          .then(data => {
            // 4 — a provider removed while WASM initializes owns no published
            // session; close its completed database immediately.
            if (isUnmountedRef.current) {
              sessionRuntime.runFork(data.releaseMockSession);
              return data;
            }

            releaseMockSessionRef.current = data.releaseMockSession;
            coreSession.store.setState({
              aggregateId: data.aggregateId,
              aggregateName: selector.frontend.aggregateName,
              userId: data.userId,
              db: data.db,
              aggregateIndex: 0,
              frontendIndex: 0,
              pushIndex: 0,
              frontendName: selector.frontend.frontendName,
              aggregateFrontendLockKey: data.aggregateFrontendLockKey,
              isInitialized: true,
              models: data.models,
              schema: data.schema,
              sessionId: coreSession.sessionId,
              systemId: data.systemId,
              systemVersion: data.systemVersion,
              sessionStatus: 'current',
              backupState: {
                status: 'ready',
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
            sessionRuntime.runFork(releaseMockSession);
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

    // 6 — existing hooks consume the same session-registry shape as the
    // production Provider; unsupported remote work fails at its signature seam.
    return createElement(
      ZerospinProviderContext.Provider,
      { value: providerContext },
      children,
    );
  };
}
