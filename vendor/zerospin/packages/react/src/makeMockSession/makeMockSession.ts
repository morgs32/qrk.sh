import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type {
  IAggregateFrontendController,
  IAnyAggregateFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type {
  IAnyModels,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { applyServiceFrontendState } from '@zerospin/core/serviceSession/applyServiceFrontendState';
import { makeServiceSession } from '@zerospin/core/serviceSession/makeServiceSession';
import { serviceSessionRepoTables } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type { ISession } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type CuidFactory,
} from '@zerospin/schema';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
  Scope,
} from 'effect';

import type { IZerospinRuntime } from '../makeRuntime/makeRuntime';

const MOCK_SYSTEM_NAME = 'mock';

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

function encodeFixtureResources<MODELS extends IAnyModels>(props: {
  models: MODELS;
  resources: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): Effect.Effect<readonly IEncodedResourceShape[], IAnyError> {
  return Effect.gen(function* () {
    const encoded: IEncodedResourceShape[] = [];
    for (const modelResources of Object.values(props.resources)) {
      if (modelResources === undefined) {
        continue;
      }
      const [firstResource] = modelResources;
      if (firstResource === undefined) {
        continue;
      }
      const model = props.models[firstResource.modelName];
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
      encoded.push(...encodedModelResources);
    }
    return encoded;
  });
}

/**
 * Detached fixture session. Construction is synchronous and acquires no
 * resources. initialize/dispose own the in-memory SQLite lifecycle. No
 * signature, backup, DevTools registration, or push delivery.
 */
export function makeMockSession<
  FRONTEND extends AuthoredAggregateFrontend,
  APP_SERVICES,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS extends APP_SERVICES | SessionRuntimeServices = never,
  MODELS extends IAnyModels = FRONTEND['models'],
>(props: {
  frontend: FRONTEND & { kind: 'aggregate'; models: MODELS };
  runtime: IZerospinRuntime<APP_SERVICES>;
  layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  authentication: FRONTEND['authentication']['authenticationSchema']['Type'];
  resources?: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): ISession<FRONTEND & { systemName: typeof MOCK_SYSTEM_NAME }> & {
  readonly systemName: typeof MOCK_SYSTEM_NAME;
  initialize(props?: {
    generateSignature?: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export function makeMockSession<
  FRONTEND extends AuthoredServiceFrontend,
  APP_SERVICES,
  MODELS extends IAnyModels = FRONTEND['models'],
>(props: {
  frontend: FRONTEND & { kind: 'service'; models: MODELS };
  runtime: IZerospinRuntime<APP_SERVICES>;
  layer?: Layer.Layer<never, IAnyError, never>;
  authentication: FRONTEND['authentication']['authenticationSchema']['Type'];
  resources?: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): IServiceSession<FRONTEND & { systemName: typeof MOCK_SYSTEM_NAME }, MODELS> & {
  readonly systemName: typeof MOCK_SYSTEM_NAME;
  initialize(props?: {
    generateSignature?: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export function makeMockSession(props: unknown): unknown {
  const {
    frontend: authoredFrontend,
    runtime,
    layer = Layer.empty,
    authentication: fixtureAuthentication,
    resources: fixtureResources = {},
  } = props as {
    frontend: (AuthoredAggregateFrontend | AuthoredServiceFrontend) & {
      kind: 'aggregate' | 'service';
      models: IAnyModels;
    };
    // Implementation body erases APP_SERVICES; callers keep exact inference via overloads.
    runtime: IZerospinRuntime<any>;
    layer?: Layer.Layer<any, IAnyError, any>;
    authentication: Readonly<Record<string, unknown>>;
    resources?: Partial<{
      [K in string]: readonly InferResource<IAnyModels[string]>[];
    }>;
  };
  const frontend = { ...authoredFrontend, systemName: MOCK_SYSTEM_NAME };
  const lifecycle = createLifecycle();

  if (frontend.kind === 'aggregate') {
    const coreSession = makeAggregateSession({
      frontend: frontend as IAggregateFrontendController,
    });

    const initialize = (_initializeProps?: {
      generateSignature?: () => Effect.Effect<unknown, IAnyError>;
    }): Promise<void> => {
      // Mock initialize ignores generateSignature when useInitializeSession
      // passes one; signature is not required for fixture sessions.
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
                systemId: null,
                frontendName: null,
                aggregateFrontendLockKey: null,
                aggregateIndex: null,
                selectionIndex: null,
                pushIndex: null,
                backupState: { status: 'released', failure: null },
              });
            }),
          );

          const application = yield* runtime.contextEffect;
          return yield* Effect.gen(function* () {
            const sessionId = yield* makeIdFromAbbreviation({
              abbreviation: coreAbbreviations.session,
            });
            const guards = yield* initializeFrontendGuards({
              frontend: frontend as IAnyAggregateFrontendController,
              layer,
            });
            // No executeAggregateFrontendCommand — staging stays local.
            coreSession.setExecutionResources({
              sessionId,
              guards,
              runtime,
            });

            const authentication = yield* Schema.encodeEffect(
              frontend.authentication.authenticationSchema,
            )(fixtureAuthentication).pipe(
              mapParseError({
                code: 'mock-session-authentication-invalid',
                prefix: 'Invalid mock authentication',
              }),
            );
            const aggregateId = yield* Schema.decodeUnknownEffect(
              makeAbbreviationIdSchema('acct'),
            )(authentication.aggregateId).pipe(
              mapParseError({
                code: 'mock-session-aggregate-id-invalid',
                prefix: 'Invalid mock aggregate ID',
              }),
            );
            const models = frontend.models;
            const dbConfig = makeResourceDbConfig({
              models,
              otherTables: sessionRepoTables,
            });
            // acquireRelease keeps open uninterruptible so dispose mid-open
            // still registers close and runs it exactly once.
            const db = yield* Effect.acquireRelease(
              makeProvisionedInMemoryWasmSqliteDb({
                dbConfig,
              }),
              acquiredDb =>
                makeAsync(
                  () =>
                    acquiredDb.$client.sqlite3.close(acquiredDb.$client.db),
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
                makeFrontendControllerSpec(
                  frontend as IAnyAggregateFrontendController,
                ).aggregateFrontendLock,
              );
            const resources = yield* encodeFixtureResources({
              models,
              resources: fixtureResources,
            });

            yield* applyAggregateFrontendState({
              db,
              frontend: frontend as IAggregateFrontendController,
              sessionId,
              aggregateId,
              authentication,
              systemId,
              frontendState: {
                aggregateId,
                aggregateName: frontend.aggregateName,
                authentication: fixtureAuthentication,
                aggregateIndex: 0,
                selectionIndex: 0,
                frontendName: frontend.name,
                aggregateVersion: frontend.aggregateVersion,
                resolutions: [],
                resources,
                systemId,
              },
              models,
            });

            coreSession.store.setState({
              aggregateId,
              aggregateName: frontend.aggregateName,
              authentication: Schema.decodeUnknownSync(
                frontend.authentication.authenticationSchema,
              )(authentication),
              db,
              aggregateIndex: 0,
              selectionIndex: 0,
              pushIndex: 0,
              frontendName: frontend.name,
              aggregateFrontendLockKey,
              isInitialized: true,
              models,
              schema: dbConfig.schema,
              sessionId,
              systemId,
              sessionStatus: 'current',
              backupState: {
                status: 'ready',
                failure: null,
              },
            });

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
                'Mock session initialization ended without publishing readiness',
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
      systemName: MOCK_SYSTEM_NAME,
      initialize,
      dispose,
    });
  }

  const coreSession = makeServiceSession({
    frontend: frontend as IServiceFrontendController,
    models: frontend.models,
  });

  const initialize = (_initializeProps?: {
    generateSignature?: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void> => {
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
              systemId: null,
              serviceName: null,
              frontendName: null,
              serviceFrontendLockKey: null,
              serviceIndex: null,
              serviceVersion: null,
              backupState: { status: 'released', failure: null },
            });
          }),
        );

        const application = yield* runtime.contextEffect;
        return yield* Effect.gen(function* () {
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.session,
          });
          coreSession.setSessionId(sessionId);

          const authentication = yield* Schema.encodeEffect(
            frontend.authentication.authenticationSchema,
          )(fixtureAuthentication).pipe(
            mapParseError({
              code: 'mock-session-authentication-invalid',
              prefix: 'Invalid mock authentication',
            }),
          );
          const models = frontend.models;
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: serviceSessionRepoTables,
          });
          // acquireRelease keeps open uninterruptible so dispose mid-open
          // still registers close and runs it exactly once.
          const db = yield* Effect.acquireRelease(
            makeProvisionedInMemoryWasmSqliteDb({
              dbConfig,
            }),
            acquiredDb =>
              makeAsync(
                () => acquiredDb.$client.sqlite3.close(acquiredDb.$client.db),
                ZerospinError.catch({
                  code: 'failed-to-close-mock-session-database',
                  message: 'Failed to close mock session database',
                }),
              ).pipe(Effect.asVoid, Effect.ignore),
          );

          const systemId = yield* makeIdFromAbbreviation({
            abbreviation: coreAbbreviations.system,
          });
          const serviceFrontendLockKey = yield* makeServiceFrontendLockKey(
            makeServiceFrontendLock({
              frontend: frontend as IServiceFrontendController,
            }),
          );
          const resources = yield* encodeFixtureResources({
            models,
            resources: fixtureResources,
          });

          yield* applyServiceFrontendState({
            frontend: frontend as IServiceFrontendController,
            sessionId,
            authentication,
            systemId,
            db,
            models,
            frontendState: {
              authentication: fixtureAuthentication,
              systemId,
              serviceName: frontend.serviceName,
              frontendName: frontend.name,
              serviceIndex: 0,
              serviceVersion: frontend.serviceVersion,
              resources,
            },
          });

          coreSession.store.setState({
            sessionId,
            authentication: Schema.decodeUnknownSync(
              frontend.authentication.authenticationSchema,
            )(authentication),
            systemId,
            serviceName: frontend.serviceName,
            frontendName: frontend.name,
            serviceFrontendLockKey,
            db,
            schema: dbConfig.schema,
            models,
            isInitialized: true,
            serviceIndex: 0,
            serviceVersion: frontend.serviceVersion,
            sessionStatus: 'current',
            backupState: {
              status: 'ready',
              failure: null,
            },
          });

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
            message:
              'Mock session initialization ended without publishing readiness',
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
    systemName: MOCK_SYSTEM_NAME,
    initialize,
    dispose,
  });
}
