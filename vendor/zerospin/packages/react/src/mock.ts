'use client';

import { createElement, useEffect, useRef, type ReactNode } from 'react';

import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { type IAnyAggregateFrontendController } from '@zerospin/core/frontendController/types';
import type {
  IAggregateId,
  IAnyModels,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import type { ISignatureFactory } from '@zerospin/core/utils/types';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type CuidFactory,
} from '@zerospin/schema';
import { Effect, Exit, Layer, ManagedRuntime, Schema, Scope } from 'effect';
import useSWRImmutable from 'swr/immutable';

import { makeBrowserSession } from './makeBrowserSession';
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
  APP_SERVICES,
  FRONTEND extends IAnyAggregateFrontendController<
    unknown,
    never,
    unknown,
    | APP_SERVICES
    | Async
    | CuidFactory
    | MonotonicFactory
    | PublishableKey
    | ZerospinApiUrl
  >,
  MODELS extends IAnyModels,
>(props: {
  frontend: Readonly<{
    frontend: FRONTEND;
    models: MODELS;
  }>;
  layer: Layer.Layer<APP_SERVICES | PublishableKey | ZerospinApiUrl, IAnyError>;
}) {
  const { frontend: selector, layer: applicationLayer } = props;

  return function MockProvider(providerProps: {
    children: ReactNode;
    generateSignature: ISignatureFactory;
    userId?: string;
    aggregateIds: {
      readonly [FRONTEND_NAME in FRONTEND['name']]: IAggregateId;
    };
    resources?: Partial<{
      [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
    }>;
  }) {
    const { children } = providerProps;
    const initializationPropsRef = useRef(providerProps);
    const isUnmountedRef = useRef(false);
    const releaseMockSessionRef = useRef<Effect.Effect<
      void,
      never,
      never
    > | null>(null);

    // 2 — the mock keeps the normal browser-session hook surface, but creates
    // no queue, websocket, backup worker, RPC, or DevTools entry.
    // 3 — build the guard layer and database before publishing the session.
    const { data: initialized, error: initializationError } = useSWRImmutable(
      initializationPropsRef,
      async () => {
        const scope = Scope.makeUnsafe();
        const sessionRuntime = ManagedRuntime.make(
          Layer.mergeAll(
            NanoIdFactory,
            UlidMonotonicFactory,
            AsyncLive,
            applicationLayer,
          ),
        );
        const initializationProps = initializationPropsRef.current;
        return sessionRuntime
          .runPromise(
            Effect.gen(function* () {
              const sessionId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.session,
              });
              const guards = yield* selector.frontend.initializeGuards;
              const coreSession = makeAggregateSession({
                guards,
                frontend: selector.frontend,
                runtime: sessionRuntime,
                sessionId,
              });
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  coreSession.store.setState({ sessionStatus: 'released' });
                }),
              );
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
                  selector.frontend.name,
                ),
              ).pipe(
                mapParseError({
                  code: 'mock-session-aggregate-id-invalid',
                  prefix: `MockProvider requires aggregateIds.${selector.frontend.name}`,
                }),
              );
              const models = selector.models;
              const dbConfig = makeResourceDbConfig({
                models,
                otherTables: sessionRepoTables,
              });
              const db = yield* makeProvisionedInMemoryWasmSqliteDb({
                dbConfig,
              });
              yield* Effect.addFinalizer(() =>
                makeAsync(
                  () => db.$client.sqlite3.close(db.$client.db),
                  ZerospinError.catch({
                    code: 'failed-to-close-mock-session-database',
                    message: 'Failed to close mock session database',
                  }),
                ).pipe(Effect.asVoid, Effect.ignore),
              );
              const systemId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.system,
              });
              const aggregateFrontendLockKey =
                yield* makeAggregateFrontendLockKey(
                  makeFrontendControllerSpec(selector.frontend)
                    .aggregateFrontendLock,
                );
              const releaseMockSession = Scope.close(scope, Exit.void).pipe(
                Effect.ensuring(sessionRuntime.disposeEffect),
              );

              return yield* Effect.gen(function* () {
                const resources: IEncodedResourceShape[] = [];
                for (const modelResources of Object.values(
                  initializationProps.resources ?? {},
                )) {
                  if (modelResources !== undefined) {
                    const [firstResource] = modelResources;
                    if (firstResource !== undefined) {
                      const model = selector.models[firstResource.modelName];
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
                    userIndex: 0,
                    frontendName: selector.frontend.name,
                    aggregateVersion: selector.frontend.aggregateVersion,
                    resolutions: [],
                    resources,
                    systemId,
                  },
                  models,
                });

                return {
                  coreSession,
                  aggregateId,
                  db,
                  aggregateFrontendLockKey,
                  models,
                  releaseMockSession,
                  schema: dbConfig.schema,
                  systemId,
                  userId,
                };
              });
            }).pipe(Effect.provideService(Scope.Scope, scope)),
          )
          .catch(async error => {
            await Effect.runPromise(
              Scope.close(scope, Exit.fail(error)).pipe(
                Effect.ensuring(sessionRuntime.disposeEffect),
              ),
            );
            throw error;
          })
          .then(data => {
            const coreSession = data.coreSession;
            // 4 — a provider removed while WASM initializes owns no published
            // session; close its completed database immediately.
            if (isUnmountedRef.current) {
              Effect.runFork(data.releaseMockSession);
              return null;
            }

            releaseMockSessionRef.current = data.releaseMockSession;
            coreSession.store.setState({
              aggregateId: data.aggregateId,
              aggregateName: selector.frontend.aggregateName,
              userId: data.userId,
              db: data.db,
              aggregateIndex: 0,
              userIndex: 0,
              pushIndex: 0,
              frontendName: selector.frontend.name,
              aggregateFrontendLockKey: data.aggregateFrontendLockKey,
              isInitialized: true,
              models: data.models,
              schema: data.schema,
              sessionId: coreSession.sessionId,
              systemId: data.systemId,
              sessionStatus: 'current',
              backupState: {
                status: 'ready',
                failure: null,
              },
            });
            const session = makeBrowserSession({ session: coreSession });
            return {
              mountedFrontends: { [selector.frontend.name]: selector },
              sessions: new Map([
                [
                  selector,
                  {
                    session,
                    subscribe: (onStoreChange: () => void) =>
                      coreSession.store.subscribe(onStoreChange),
                    getState: () => coreSession.store.getState(),
                    getLiveQueryDb: () =>
                      getInitializedStateOrThrow({ session: coreSession }).db,
                  },
                ],
              ]),
              sessionRuntime,
            };
          });
      },
      {
        shouldRetryOnError: false,
      },
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
            Effect.runFork(releaseMockSession);
          });
        }
      };
    }, []);

    if (initializationError) {
      throw initializationError;
    }

    if (!initialized) {
      return null;
    }

    // 6 — existing hooks consume the same session-registry shape as the
    // production Provider; unsupported remote work fails at its signature seam.
    return createElement(
      ZerospinProviderContext.Provider,
      { value: initialized },
      children,
    );
  };
}
