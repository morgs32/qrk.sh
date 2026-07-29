import type { Async } from '@zerospin/core/async/Async';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import type { IServiceFrontendController } from '@zerospin/core/serviceFrontendController/types';
import {
  PublishableKey as PublishableKeyService,
  type PublishableKey,
} from '@zerospin/core/services/PublishableKey';
import {
  ZerospinApisUrl as ZerospinApisUrlService,
  type ZerospinApisUrl,
} from '@zerospin/core/services/ZerospinApisUrl';
import { applyServiceFrontendBlock } from '@zerospin/core/serviceSession/applyServiceFrontendBlock';
import { applyServiceFrontendReplicaBlock } from '@zerospin/core/serviceSession/applyServiceFrontendReplicaBlock';
import { applyServiceFrontendReplicaState } from '@zerospin/core/serviceSession/applyServiceFrontendReplicaState';
import { applyServiceFrontendState } from '@zerospin/core/serviceSession/applyServiceFrontendState';
import type {
  IServiceFrontendReplicaBlock,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { createServiceFrontendWebSocketTicket } from '@zerospin/frontend/createServiceFrontendWebSocketTicket';
import { fetchServiceFrontend } from '@zerospin/frontend/fetchServiceFrontend';
import { fetchServiceFrontendState } from '@zerospin/frontend/fetchServiceFrontendState';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Either, Redacted, Runtime, Schema } from 'effect';

import { acquireServiceFrontendWebSocket } from './acquireServiceFrontendWebSocket';
import type { IBrowserPartitionController } from './makeBrowserPartitionController';

export const bootstrapBrowserServiceSession = Effect.fn(
  'bootstrapBrowserServiceSession',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  session: IServiceSession<FRONTEND>;
  browserPartitionController: IBrowserPartitionController;
}): Effect.fn.Return<
  Readonly<{ releaseBrowserSession: Effect.Effect<void> }>,
  IAnyError,
  Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
> {
  const { browserPartitionController, session } = props;
  const frontend = session.frontend;
  const apiUrl = yield* ZerospinApisUrlService;
  const publishableKey = yield* PublishableKeyService;
  const publishableKeyValue = Redacted.value(publishableKey);
  const runtime = yield* Effect.runtime<
    Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
  >();
  const compiledFrontendSpec = makeServiceFrontendControllerSpec(frontend);
  const compiledFrontendSpecHash =
    yield* makeFrontendSpecHash(compiledFrontendSpec);

  const admitted = yield* fetchServiceFrontend({
    frontend,
    generateSignature: () =>
      browserPartitionController
        .getServiceGenerateSignature(frontend)()
        .pipe(
          Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
          Effect.mapError(error =>
            ZerospinError.isZerospinError(error)
              ? error
              : new ZerospinError({
                  code: 'service-frontend-signature-invalid',
                  message:
                    'Configured service frontend signature does not match its controller schema',
                  cause: ZerospinError.prettyUnknownFailure(error),
                }),
          ),
        ),
  }).pipe(Effect.either);

  if (Either.isLeft(admitted)) {
    const isTransportFailure =
      admitted.left.code === 'service-frontend-admission-transport-failed' ||
      admitted.left.code === 'async-failed' ||
      admitted.left.cause?.includes('fetch failed') === true ||
      admitted.left.cause?.includes('ECONNREFUSED') === true ||
      admitted.left.cause?.includes('NetworkError') === true;
    const isSameTargetVersionMismatch =
      admitted.left.code === 'service-frontend-admission-target-mismatch' &&
      admitted.left.extra !== null &&
      admitted.left.extra.expectedServiceName ===
        admitted.left.extra.serviceName &&
      admitted.left.extra.expectedActorName === admitted.left.extra.actorName &&
      admitted.left.extra.expectedFrontendName ===
        admitted.left.extra.frontendName &&
      admitted.left.extra.expectedFrontendVersion !==
        admitted.left.extra.frontendVersion;
    const isAuthorityRejection =
      String(admitted.left.code).includes('signature-invalid') ||
      String(admitted.left.code).includes('authentication') ||
      String(admitted.left.code).includes('authorization') ||
      String(admitted.left.code).includes('authenticate') ||
      String(admitted.left.code).includes('authorize') ||
      String(admitted.left.code).includes('authenticator') ||
      (admitted.left.code === 'service-frontend-admission-target-mismatch' &&
        !isSameTargetVersionMismatch);
    if (isAuthorityRejection) {
      yield* browserPartitionController.invalidateCachedServiceFrontendLocators(
        {
          apiUrl,
          publishableKey: publishableKeyValue,
          error: admitted.left,
          frontend,
        },
      );
    }
    if (
      !browserPartitionController.isSharedWorkerEnabled ||
      !isTransportFailure
    ) {
      return yield* admitted.left;
    }

    const cachedLocator =
      browserPartitionController.getCachedServiceFrontendLocator({
        apiUrl,
        publishableKey: publishableKeyValue,
        frontend,
        role: 'active',
      });
    if (cachedLocator === null) {
      return yield* admitted.left;
    }

    const dbConfig = makeResourceDbConfig<FRONTEND['models']>({
      models: frontend.models,
    });
    const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
    let isDatabaseClosed = false;
    let currentFrontendIndex = 0;
    let currentReplicaIndex = 0;
    let previousReplicaBlock: IServiceFrontendReplicaBlock | null = null;
    let isWorkerUpdateRequired = false;
    let isWorkerOnline = false;
    let currentActorId = cachedLocator.actorId;
    let currentSystemId = cachedLocator.systemId;
    let currentGenerationId = cachedLocator.generationId;

    const acquisition = yield* browserPartitionController
      .acquireServiceFrontendReplica({
        frontend,
        apiUrl,
        publishableKey: publishableKeyValue,
        systemId: cachedLocator.systemId,
        generationId: cachedLocator.generationId,
        systemVersion: cachedLocator.systemVersion,
        serviceName: cachedLocator.serviceName,
        actorId: cachedLocator.actorId,
        actorName: cachedLocator.actorName,
        frontendName: cachedLocator.frontendName,
        frontendVersion: cachedLocator.frontendVersion,
        frontendSpec: compiledFrontendSpec,
        frontendSpecHash: compiledFrontendSpecHash,
        authority: 'cached-offline',
        role: 'active',
        commissionOwnerId: null,
        network: null,
        transportRegain: async () => {
          const regained = await Runtime.runPromise(runtime)(
            fetchServiceFrontend({
              frontend,
              generateSignature: () =>
                browserPartitionController
                  .getServiceGenerateSignature(frontend)()
                  .pipe(
                    Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                    Effect.mapError(error =>
                      ZerospinError.isZerospinError(error)
                        ? error
                        : new ZerospinError({
                            code: 'service-frontend-signature-invalid',
                            message:
                              'Configured service frontend signature does not match its controller schema after transport returned',
                            cause: ZerospinError.prettyUnknownFailure(error),
                          }),
                    ),
                  ),
            }).pipe(Effect.either),
          );
          if (Either.isLeft(regained)) {
            const isRegainTransportFailure =
              regained.left.code ===
                'service-frontend-admission-transport-failed' ||
              regained.left.code === 'async-failed' ||
              regained.left.cause?.includes('fetch failed') === true ||
              regained.left.cause?.includes('ECONNREFUSED') === true ||
              regained.left.cause?.includes('NetworkError') === true;
            if (isRegainTransportFailure) {
              return;
            }
            if (
              regained.left.code ===
                'service-frontend-admission-target-mismatch' &&
              regained.left.extra !== null &&
              regained.left.extra.expectedServiceName ===
                regained.left.extra.serviceName &&
              regained.left.extra.expectedActorName ===
                regained.left.extra.actorName &&
              regained.left.extra.expectedFrontendName ===
                regained.left.extra.frontendName &&
              regained.left.extra.expectedFrontendVersion !==
                regained.left.extra.frontendVersion
            ) {
              // A server-side version promotion for the same authored service
              // target requires matching client code, not authority teardown.
              return 'update-required';
            }
            const isAuthorityRejection =
              String(regained.left.code).includes('signature-invalid') ||
              String(regained.left.code).includes('authentication') ||
              String(regained.left.code).includes('authorization') ||
              String(regained.left.code).includes('authenticate') ||
              String(regained.left.code).includes('authorize') ||
              String(regained.left.code).includes('authenticator') ||
              regained.left.code ===
                'service-frontend-admission-target-mismatch';
            if (!isAuthorityRejection) {
              return;
            }
            await Runtime.runPromise(runtime)(
              browserPartitionController.invalidateCachedServiceFrontendLocators(
                {
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  error: regained.left,
                  frontend,
                },
              ),
            );
            return;
          }

          const releaseRegainedFrontendApi = regained.right.releaseFrontendApi;
          if (
            regained.right.identity.systemId !== cachedLocator.systemId ||
            regained.right.identity.serviceName !== cachedLocator.serviceName ||
            regained.right.identity.actorId !== cachedLocator.actorId ||
            regained.right.identity.actorName !== cachedLocator.actorName ||
            regained.right.identity.frontendName !== cachedLocator.frontendName
          ) {
            releaseRegainedFrontendApi();
            await Runtime.runPromise(runtime)(
              browserPartitionController.invalidateCachedServiceFrontendLocators(
                {
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  error: new ZerospinError({
                    code: 'service-frontend-offline-regain-target-mismatch',
                    message:
                      'Reauthenticated service frontend does not match the cached offline replica',
                  }),
                  frontend,
                },
              ),
            );
            return;
          }

          const regainedFrontendSpecHash = await Runtime.runPromise(runtime)(
            makeFrontendSpecHash(regained.right.frontendSpec).pipe(
              Effect.either,
            ),
          );
          if (
            Either.isLeft(regainedFrontendSpecHash) ||
            regainedFrontendSpecHash.right !== compiledFrontendSpecHash ||
            regained.right.identity.frontendVersion !== frontend.version
          ) {
            releaseRegainedFrontendApi();
            // A same-principal successor or version change is not identity
            // revocation. Keep the source locator and replica so a matching
            // compiled controller can resume the transition later.
            return 'update-required';
          }

          releaseRegainedFrontendApi();
          const upgraded = await Runtime.runPromise(runtime)(
            browserPartitionController
              .acquireServiceFrontendReplica({
                frontend,
                apiUrl,
                publishableKey: publishableKeyValue,
                systemId: regained.right.identity.systemId,
                generationId: regained.right.identity.generationId,
                systemVersion: regained.right.identity.systemVersion,
                serviceName: regained.right.identity.serviceName,
                actorId: regained.right.identity.actorId,
                actorName: regained.right.identity.actorName,
                frontendName: regained.right.identity.frontendName,
                frontendVersion: regained.right.identity.frontendVersion,
                frontendSpec: regained.right.frontendSpec,
                frontendSpecHash: regainedFrontendSpecHash.right,
                authority: 'online',
                role: 'active',
                commissionOwnerId: null,
                network: {
                  getFrontendState: () =>
                    Runtime.runPromise(runtime)(
                      encodeRpc(
                        Effect.acquireUseRelease(
                          fetchServiceFrontend({
                            frontend,
                            generateSignature: () =>
                              browserPartitionController
                                .getServiceGenerateSignature(frontend)()
                                .pipe(
                                  Effect.flatMap(
                                    Schema.decodeUnknown(frontend.signature),
                                  ),
                                  Effect.mapError(error =>
                                    ZerospinError.isZerospinError(error)
                                      ? error
                                      : new ZerospinError({
                                          code:
                                            'service-frontend-signature-invalid',
                                          message:
                                            'Configured service frontend state signature does not match its controller schema',
                                          cause:
                                            ZerospinError.prettyUnknownFailure(
                                              error,
                                            ),
                                        }),
                                  ),
                                ),
                          }).pipe(
                            Effect.mapError(error =>
                              error.code ===
                                'service-frontend-admission-target-mismatch' &&
                              error.extra !== null &&
                              error.extra.expectedServiceName ===
                                error.extra.serviceName &&
                              error.extra.expectedActorName ===
                                error.extra.actorName &&
                              error.extra.expectedFrontendName ===
                                error.extra.frontendName &&
                              error.extra.expectedFrontendVersion !==
                                error.extra.frontendVersion
                                ? new ZerospinError({
                                    code: 'frontend-version-changed',
                                    message:
                                      'The authenticated service frontend now requires a different compiled version',
                                    cause: ZerospinError.stringify(error),
                                  })
                                : error,
                            ),
                          ),
                          currentFrontend =>
                            Effect.gen(function* () {
                              if (
                                currentFrontend.identity.systemId !==
                                  regained.right.identity.systemId ||
                                currentFrontend.identity.serviceName !==
                                  regained.right.identity.serviceName ||
                                currentFrontend.identity.actorId !==
                                  regained.right.identity.actorId ||
                                currentFrontend.identity.actorName !==
                                  regained.right.identity.actorName ||
                                currentFrontend.identity.frontendName !==
                                  regained.right.identity.frontendName
                              ) {
                                return yield* new ZerospinError({
                                  code:
                                    'service-frontend-authentication-target-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved another target',
                                });
                              }
                              const currentFrontendSpecHash =
                                yield* makeFrontendSpecHash(
                                  currentFrontend.frontendSpec,
                                );
                              if (
                                currentFrontend.identity.frontendVersion !==
                                  regained.right.identity.frontendVersion ||
                                currentFrontendSpecHash !==
                                  regainedFrontendSpecHash.right
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-version-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved another compiled version',
                                });
                              }
                              if (
                                currentFrontend.identity.generationId !==
                                regained.right.identity.generationId
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-generation-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved a successor generation',
                                });
                              }
                              return yield* fetchServiceFrontendState({
                                frontendApi: currentFrontend.frontendApi,
                              });
                            }),
                          currentFrontend =>
                            Effect.sync(currentFrontend.releaseFrontendApi),
                        ).pipe(
                          Effect.tapError(error => {
                            const isTransportFailure =
                              error.code ===
                                'service-frontend-admission-transport-failed' ||
                              error.code === 'async-failed' ||
                              error.cause?.includes('fetch failed') === true ||
                              error.cause?.includes('ECONNREFUSED') === true ||
                              error.cause?.includes('NetworkError') === true;
                            const isAuthorityRejection =
                              String(error.code).includes('signature-invalid') ||
                              String(error.code).includes('authentication') ||
                              String(error.code).includes('authorization') ||
                              String(error.code).includes('authenticate') ||
                              String(error.code).includes('authorize') ||
                              String(error.code).includes('authenticator') ||
                              error.code ===
                                'service-frontend-admission-target-mismatch';
                            return isTransportFailure ||
                              error.code === 'frontend-version-changed' ||
                              error.code === 'frontend-generation-changed' ||
                              !isAuthorityRejection
                              ? Effect.void
                              : browserPartitionController.invalidateCachedServiceFrontendLocators(
                                  {
                                    apiUrl,
                                    publishableKey: publishableKeyValue,
                                    error,
                                    frontend,
                                  },
                                );
                          }),
                        ),
                      ),
                    ),
                  createFrontendWebSocketTicket: () =>
                    Runtime.runPromise(runtime)(
                      encodeRpc(
                        Effect.acquireUseRelease(
                          fetchServiceFrontend({
                            frontend,
                            generateSignature: () =>
                              browserPartitionController
                                .getServiceGenerateSignature(frontend)()
                                .pipe(
                                  Effect.flatMap(
                                    Schema.decodeUnknown(frontend.signature),
                                  ),
                                  Effect.mapError(error =>
                                    ZerospinError.isZerospinError(error)
                                      ? error
                                      : new ZerospinError({
                                          code:
                                            'service-frontend-signature-invalid',
                                          message:
                                            'Configured service frontend ticket signature does not match its controller schema',
                                          cause:
                                            ZerospinError.prettyUnknownFailure(
                                              error,
                                            ),
                                        }),
                                  ),
                                ),
                          }).pipe(
                            Effect.mapError(error =>
                              error.code ===
                                'service-frontend-admission-target-mismatch' &&
                              error.extra !== null &&
                              error.extra.expectedServiceName ===
                                error.extra.serviceName &&
                              error.extra.expectedActorName ===
                                error.extra.actorName &&
                              error.extra.expectedFrontendName ===
                                error.extra.frontendName &&
                              error.extra.expectedFrontendVersion !==
                                error.extra.frontendVersion
                                ? new ZerospinError({
                                    code: 'frontend-version-changed',
                                    message:
                                      'The authenticated service frontend now requires a different compiled version',
                                    cause: ZerospinError.stringify(error),
                                  })
                                : error,
                            ),
                          ),
                          currentFrontend =>
                            Effect.gen(function* () {
                              if (
                                currentFrontend.identity.systemId !==
                                  regained.right.identity.systemId ||
                                currentFrontend.identity.serviceName !==
                                  regained.right.identity.serviceName ||
                                currentFrontend.identity.actorId !==
                                  regained.right.identity.actorId ||
                                currentFrontend.identity.actorName !==
                                  regained.right.identity.actorName ||
                                currentFrontend.identity.frontendName !==
                                  regained.right.identity.frontendName
                              ) {
                                return yield* new ZerospinError({
                                  code:
                                    'service-frontend-authentication-target-changed',
                                  message:
                                    'Fresh service frontend ticket authentication resolved another target',
                                });
                              }
                              const currentFrontendSpecHash =
                                yield* makeFrontendSpecHash(
                                  currentFrontend.frontendSpec,
                                );
                              if (
                                currentFrontend.identity.frontendVersion !==
                                  regained.right.identity.frontendVersion ||
                                currentFrontendSpecHash !==
                                  regainedFrontendSpecHash.right
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-version-changed',
                                  message:
                                    'Fresh service frontend ticket authentication resolved another compiled version',
                                });
                              }
                              return yield* createServiceFrontendWebSocketTicket(
                                {
                                  frontendApi: currentFrontend.frontendApi,
                                },
                              );
                            }),
                          currentFrontend =>
                            Effect.sync(currentFrontend.releaseFrontendApi),
                        ).pipe(
                          Effect.tapError(error => {
                            const isTransportFailure =
                              error.code ===
                                'service-frontend-admission-transport-failed' ||
                              error.code === 'async-failed' ||
                              error.cause?.includes('fetch failed') === true ||
                              error.cause?.includes('ECONNREFUSED') === true ||
                              error.cause?.includes('NetworkError') === true;
                            const isAuthorityRejection =
                              String(error.code).includes('signature-invalid') ||
                              String(error.code).includes('authentication') ||
                              String(error.code).includes('authorization') ||
                              String(error.code).includes('authenticate') ||
                              String(error.code).includes('authorize') ||
                              String(error.code).includes('authenticator') ||
                              error.code ===
                                'service-frontend-admission-target-mismatch';
                            return isTransportFailure ||
                              error.code === 'frontend-version-changed' ||
                              error.code === 'frontend-generation-changed' ||
                              !isAuthorityRejection
                              ? Effect.void
                              : browserPartitionController.invalidateCachedServiceFrontendLocators(
                                  {
                                    apiUrl,
                                    publishableKey: publishableKeyValue,
                                    error,
                                    frontend,
                                  },
                                );
                          }),
                        ),
                      ),
                    ),
                },
                transportRegain: null,
              })
              .pipe(Effect.either),
          );
          if (Either.isLeft(upgraded)) {
            // Failed transition/preflight must preserve the only discoverable
            // source locator for a later authority retry. The controller
            // retained or released the target capability before returning.
            return;
          }
          return;
        },
      })
      .pipe(
        Effect.tapError(() =>
          Effect.tryPromise({
            try: async () => {
              if (isDatabaseClosed) {
                return;
              }
              isDatabaseClosed = true;
              await db.$client.sqlite3.close(db.$client.db);
            },
            catch: ZerospinError.catch({
              code: 'service-frontend-session-database-close-failed',
              message:
                'Failed to close the cached service frontend Provider database after acquisition failure',
            }),
          }).pipe(Effect.ignore),
        ),
      );
    const hydrated = yield* acquisition.hydrateSession({
      sessionId: session.sessionId,
      replaceFrontendState: async frontendReplicaState => {
        await Runtime.runPromise(runtime)(
          applyServiceFrontendReplicaState({
            frontend,
            actorId: frontendReplicaState.actorId,
            systemId: frontendReplicaState.systemId,
            generationId: frontendReplicaState.generationId,
            systemVersion: frontendReplicaState.systemVersion,
            systemWorkerName: frontendReplicaState.systemWorkerName,
            db,
            models: frontend.models,
            frontendReplicaState,
          }),
        );
        currentFrontendIndex = frontendReplicaState.frontendIndex;
        currentReplicaIndex = frontendReplicaState.replicaIndex;
        previousReplicaBlock = null;
        currentActorId = frontendReplicaState.actorId;
        currentSystemId = frontendReplicaState.systemId;
        currentGenerationId = frontendReplicaState.generationId;
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            serviceName: frontendReplicaState.serviceName,
            actorId: frontendReplicaState.actorId,
            systemId: frontendReplicaState.systemId,
            generationId: frontendReplicaState.generationId,
            systemVersion: frontendReplicaState.systemVersion,
            systemWorkerName: frontendReplicaState.systemWorkerName,
            frontendName: frontendReplicaState.frontendName,
            frontendVersion: frontendReplicaState.frontendVersion,
            frontendIndex: currentFrontendIndex,
            replicaIndex: currentReplicaIndex,
            workerState: {
              ...state.workerState,
              status: isWorkerUpdateRequired
                ? 'update-required'
                : isWorkerOnline
                  ? 'online'
                  : 'offline',
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
              failure: null,
            },
          });
        }
      },
      setDatabaseName: databaseName => {
        const state = session.store.getState();
        if (!state.isInitialized) {
          return;
        }
        session.store.setState({
          workerState: {
            ...state.workerState,
            databaseName,
          },
        });
      },
      setOnline: () => {
        isWorkerOnline = true;
        const state = session.store.getState();
        if (!state.isInitialized) {
          return;
        }
        session.store.setState({
          workerState: {
            ...state.workerState,
            status: isWorkerUpdateRequired ? 'update-required' : 'online',
            failure: null,
          },
        });
      },
      handleServiceFrontendReplicaBlock: async frontendReplicaBlock => {
        const outcome = await Runtime.runPromise(runtime)(
          applyServiceFrontendReplicaBlock({
            frontend,
            actorId: currentActorId,
            systemId: currentSystemId,
            generationId: currentGenerationId,
            currentFrontendIndex,
            currentReplicaIndex,
            previousReplicaBlock,
            db,
            models: frontend.models,
            frontendReplicaBlock,
          }),
        );
        if (outcome === 'applied') {
          currentFrontendIndex = frontendReplicaBlock.frontendIndex;
          currentReplicaIndex = frontendReplicaBlock.replicaIndex;
          previousReplicaBlock = frontendReplicaBlock;
        }
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            frontendIndex: currentFrontendIndex,
            replicaIndex: currentReplicaIndex,
            workerState: {
              ...state.workerState,
              status: isWorkerUpdateRequired
                ? 'update-required'
                : isWorkerOnline
                  ? 'online'
                  : 'offline',
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
            },
          });
        }
      },
      setRepairing: () => {
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: isWorkerUpdateRequired ? 'update-required' : 'repairing',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure: null,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: isWorkerUpdateRequired ? 'update-required' : 'repairing',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure: null,
            },
          });
        }
      },
      setUpdateRequired: () => {
        isWorkerUpdateRequired = true;
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'update-required',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure: state.workerState.failure,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'update-required',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure: state.workerState.failure,
            },
          });
        }
      },
      setFailure: error => {
        const failure = Schema.encodeSync(ZerospinError.schema)(
          ZerospinError.isZerospinError(error)
            ? error
            : ZerospinError.catch({
                code: 'service-frontend-session-repair-failed',
                message: 'Service frontend main-thread repair failed',
              })(error),
        );
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'failed',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'failed',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure,
            },
          });
        }
      },
      teardown: async error => {
        const state = session.store.getState();
        const failure: IAnyErrorJson | null =
          error === null
            ? null
            : Schema.encodeSync(ZerospinError.schema)(error);
        session.store.setState({
          sessionId: session.sessionId,
          actorId: null,
          systemId: null,
          generationId: null,
          systemVersion: null,
          systemWorkerName: null,
          serviceName: null,
          actorName: null,
          frontendName: null,
          frontendVersion: null,
          db: null,
          schema: null,
          models: null,
          isInitialized: false,
          frontendIndex: null,
          replicaIndex: null,
          workerState: {
            mode: 'shared-worker',
            status: error === null ? 'released' : 'failed',
            bootstrapSource: null,
            frontendIndex: null,
            replicaIndex: null,
            databaseName: null,
            failure,
          },
          telemetry: state.telemetry,
          telemetryCollector: state.telemetryCollector,
        });
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
        if (isDatabaseClosed) {
          return;
        }
        isDatabaseClosed = true;
        await db.$client.sqlite3.close(db.$client.db);
      },
    });

    const frontendReplicaState = hydrated.serviceFrontendReplicaState;
    session.store.setState({
      sessionId: session.sessionId,
      actorId: frontendReplicaState.actorId,
      systemId: frontendReplicaState.systemId,
      generationId: frontendReplicaState.generationId,
      systemVersion: frontendReplicaState.systemVersion,
      systemWorkerName: frontendReplicaState.systemWorkerName,
      serviceName: frontendReplicaState.serviceName,
      actorName: frontendReplicaState.actorName,
      frontendName: frontendReplicaState.frontendName,
      frontendVersion: frontendReplicaState.frontendVersion,
      db,
      schema: dbConfig.schema,
      models: frontend.models,
      isInitialized: true,
      frontendIndex: frontendReplicaState.frontendIndex,
      replicaIndex: frontendReplicaState.replicaIndex,
      workerState: {
        mode: 'shared-worker',
        status: isWorkerUpdateRequired
          ? 'update-required'
          : isWorkerOnline
            ? 'online'
            : 'offline',
        bootstrapSource: 'replica',
        frontendIndex: frontendReplicaState.frontendIndex,
        replicaIndex: frontendReplicaState.replicaIndex,
        databaseName: hydrated.databaseName,
        failure: null,
      },
    });

    return {
      releaseBrowserSession: hydrated.release,
    };
  }

  const releaseFrontendApi = Effect.sync(admitted.right.releaseFrontendApi);
  const admittedFrontendSpecHash = yield* makeFrontendSpecHash(
    admitted.right.frontendSpec,
  ).pipe(Effect.tapError(() => releaseFrontendApi));
  if (admittedFrontendSpecHash !== compiledFrontendSpecHash) {
    const compiledSpecMismatch = new ZerospinError({
      code: 'service-frontend-compiled-spec-mismatch',
      message:
        'Authenticated service frontend spec does not match the compiled controller',
    });
    if (browserPartitionController.isSharedWorkerEnabled) {
      yield* browserPartitionController.invalidateCachedServiceFrontendLocators(
        {
          apiUrl,
          publishableKey: publishableKeyValue,
          error: compiledSpecMismatch,
          frontend,
        },
      );
    }
    yield* releaseFrontendApi;
    return yield* compiledSpecMismatch;
  }

  const identity = admitted.right.identity;
  if (browserPartitionController.isSharedWorkerEnabled) {
    yield* releaseFrontendApi;
  }
  const dbConfig = makeResourceDbConfig<FRONTEND['models']>({
    models: frontend.models,
  });
  const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig }).pipe(
    Effect.tapError(() =>
      browserPartitionController.isSharedWorkerEnabled
        ? Effect.void
        : releaseFrontendApi,
    ),
  );
  let isDatabaseClosed = false;
  let currentFrontendIndex = 0;
  let currentReplicaIndex = 0;
  let previousReplicaBlock: IServiceFrontendReplicaBlock | null = null;
  let isWorkerUpdateRequired = false;
  let currentActorId = identity.actorId;
  let currentSystemId = identity.systemId;
  let currentGenerationId = identity.generationId;

  if (browserPartitionController.isSharedWorkerEnabled) {
    const acquisition = yield* browserPartitionController
      .acquireServiceFrontendReplica({
        frontend,
        apiUrl,
        publishableKey: publishableKeyValue,
        systemId: identity.systemId,
        generationId: identity.generationId,
        systemVersion: identity.systemVersion,
        serviceName: identity.serviceName,
        actorId: identity.actorId,
        actorName: identity.actorName,
        frontendName: identity.frontendName,
        frontendVersion: identity.frontendVersion,
        frontendSpec: admitted.right.frontendSpec,
        frontendSpecHash: compiledFrontendSpecHash,
        authority: 'online',
        role: 'active',
        commissionOwnerId: null,
        network: {
          getFrontendState: () =>
            Runtime.runPromise(runtime)(
              encodeRpc(
                Effect.acquireUseRelease(
                  fetchServiceFrontend({
                    frontend,
                    generateSignature: () =>
                      browserPartitionController
                        .getServiceGenerateSignature(frontend)()
                        .pipe(
                          Effect.flatMap(
                            Schema.decodeUnknown(frontend.signature),
                          ),
                          Effect.mapError(error =>
                            ZerospinError.isZerospinError(error)
                              ? error
                              : new ZerospinError({
                                  code: 'service-frontend-signature-invalid',
                                  message:
                                    'Configured service frontend state signature does not match its controller schema',
                                  cause:
                                    ZerospinError.prettyUnknownFailure(error),
                                }),
                          ),
                        ),
                  }).pipe(
                    Effect.mapError(error =>
                      error.code ===
                        'service-frontend-admission-target-mismatch' &&
                      error.extra !== null &&
                      error.extra.expectedServiceName ===
                        error.extra.serviceName &&
                      error.extra.expectedActorName === error.extra.actorName &&
                      error.extra.expectedFrontendName ===
                        error.extra.frontendName &&
                      error.extra.expectedFrontendVersion !==
                        error.extra.frontendVersion
                        ? new ZerospinError({
                            code: 'frontend-version-changed',
                            message:
                              'The authenticated service frontend now requires a different compiled version',
                            cause: ZerospinError.stringify(error),
                          })
                        : error,
                    ),
                  ),
                  currentFrontend =>
                    Effect.gen(function* () {
                      if (
                        currentFrontend.identity.systemId !==
                          identity.systemId ||
                        currentFrontend.identity.serviceName !==
                          identity.serviceName ||
                        currentFrontend.identity.actorId !== identity.actorId ||
                        currentFrontend.identity.actorName !==
                          identity.actorName ||
                        currentFrontend.identity.frontendName !==
                          identity.frontendName
                      ) {
                        return yield* new ZerospinError({
                          code:
                            'service-frontend-authentication-target-changed',
                          message:
                            'Fresh service frontend state authentication resolved another target',
                        });
                      }
                      const currentFrontendSpecHash =
                        yield* makeFrontendSpecHash(
                          currentFrontend.frontendSpec,
                        );
                      if (
                        currentFrontend.identity.frontendVersion !==
                          identity.frontendVersion ||
                        currentFrontendSpecHash !== compiledFrontendSpecHash
                      ) {
                        return yield* new ZerospinError({
                          code: 'frontend-version-changed',
                          message:
                            'Fresh service frontend state authentication resolved another compiled version',
                        });
                      }
                      if (
                        currentFrontend.identity.generationId !==
                        identity.generationId
                      ) {
                        return yield* new ZerospinError({
                          code: 'frontend-generation-changed',
                          message:
                            'Fresh service frontend state authentication resolved a successor generation',
                        });
                      }
                      return yield* fetchServiceFrontendState({
                        frontendApi: currentFrontend.frontendApi,
                      });
                    }),
                  currentFrontend =>
                    Effect.sync(currentFrontend.releaseFrontendApi),
                ).pipe(
                  Effect.tapError(error => {
                    const isTransportFailure =
                      error.code ===
                        'service-frontend-admission-transport-failed' ||
                      error.code === 'async-failed' ||
                      error.cause?.includes('fetch failed') === true ||
                      error.cause?.includes('ECONNREFUSED') === true ||
                      error.cause?.includes('NetworkError') === true;
                    const isAuthorityRejection =
                      String(error.code).includes('signature-invalid') ||
                      String(error.code).includes('authentication') ||
                      String(error.code).includes('authorization') ||
                      String(error.code).includes('authenticate') ||
                      String(error.code).includes('authorize') ||
                      String(error.code).includes('authenticator') ||
                      error.code ===
                        'service-frontend-admission-target-mismatch';
                    return isTransportFailure ||
                      error.code === 'frontend-version-changed' ||
                      error.code === 'frontend-generation-changed' ||
                      !isAuthorityRejection
                      ? Effect.void
                      : browserPartitionController.invalidateCachedServiceFrontendLocators(
                          {
                            apiUrl,
                            publishableKey: publishableKeyValue,
                            error,
                            frontend,
                          },
                        );
                  }),
                ),
              ),
            ),
          createFrontendWebSocketTicket: () =>
            Runtime.runPromise(runtime)(
              encodeRpc(
                Effect.acquireUseRelease(
                  fetchServiceFrontend({
                    frontend,
                    generateSignature: () =>
                      browserPartitionController
                        .getServiceGenerateSignature(frontend)()
                        .pipe(
                          Effect.flatMap(
                            Schema.decodeUnknown(frontend.signature),
                          ),
                          Effect.mapError(error =>
                            ZerospinError.isZerospinError(error)
                              ? error
                              : new ZerospinError({
                                  code: 'service-frontend-signature-invalid',
                                  message:
                                    'Configured service frontend ticket signature does not match its controller schema',
                                  cause:
                                    ZerospinError.prettyUnknownFailure(error),
                                }),
                          ),
                        ),
                  }).pipe(
                    Effect.mapError(error =>
                      error.code ===
                        'service-frontend-admission-target-mismatch' &&
                      error.extra !== null &&
                      error.extra.expectedServiceName ===
                        error.extra.serviceName &&
                      error.extra.expectedActorName === error.extra.actorName &&
                      error.extra.expectedFrontendName ===
                        error.extra.frontendName &&
                      error.extra.expectedFrontendVersion !==
                        error.extra.frontendVersion
                        ? new ZerospinError({
                            code: 'frontend-version-changed',
                            message:
                              'The authenticated service frontend now requires a different compiled version',
                            cause: ZerospinError.stringify(error),
                          })
                        : error,
                    ),
                  ),
                  currentFrontend =>
                    Effect.gen(function* () {
                      if (
                        currentFrontend.identity.systemId !==
                          identity.systemId ||
                        currentFrontend.identity.serviceName !==
                          identity.serviceName ||
                        currentFrontend.identity.actorId !== identity.actorId ||
                        currentFrontend.identity.actorName !==
                          identity.actorName ||
                        currentFrontend.identity.frontendName !==
                          identity.frontendName
                      ) {
                        return yield* new ZerospinError({
                          code:
                            'service-frontend-authentication-target-changed',
                          message:
                            'Fresh service frontend ticket authentication resolved another target',
                        });
                      }
                      const currentFrontendSpecHash =
                        yield* makeFrontendSpecHash(
                          currentFrontend.frontendSpec,
                        );
                      if (
                        currentFrontend.identity.frontendVersion !==
                          identity.frontendVersion ||
                        currentFrontendSpecHash !== compiledFrontendSpecHash
                      ) {
                        return yield* new ZerospinError({
                          code: 'frontend-version-changed',
                          message:
                            'Fresh service frontend ticket authentication resolved another compiled version',
                        });
                      }
                      return yield* createServiceFrontendWebSocketTicket({
                        frontendApi: currentFrontend.frontendApi,
                      });
                    }),
                  currentFrontend =>
                    Effect.sync(currentFrontend.releaseFrontendApi),
                ).pipe(
                  Effect.tapError(error => {
                    const isTransportFailure =
                      error.code ===
                        'service-frontend-admission-transport-failed' ||
                      error.code === 'async-failed' ||
                      error.cause?.includes('fetch failed') === true ||
                      error.cause?.includes('ECONNREFUSED') === true ||
                      error.cause?.includes('NetworkError') === true;
                    const isAuthorityRejection =
                      String(error.code).includes('signature-invalid') ||
                      String(error.code).includes('authentication') ||
                      String(error.code).includes('authorization') ||
                      String(error.code).includes('authenticate') ||
                      String(error.code).includes('authorize') ||
                      String(error.code).includes('authenticator') ||
                      error.code ===
                        'service-frontend-admission-target-mismatch';
                    return isTransportFailure ||
                      error.code === 'frontend-version-changed' ||
                      error.code === 'frontend-generation-changed' ||
                      !isAuthorityRejection
                      ? Effect.void
                      : browserPartitionController.invalidateCachedServiceFrontendLocators(
                          {
                            apiUrl,
                            publishableKey: publishableKeyValue,
                            error,
                            frontend,
                          },
                        );
                  }),
                ),
              ),
            ),
        },
        transportRegain: async () => {
          const regained = await Runtime.runPromise(runtime)(
            fetchServiceFrontend({
              frontend,
              generateSignature: () =>
                browserPartitionController
                  .getServiceGenerateSignature(frontend)()
                  .pipe(
                    Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                    Effect.mapError(error =>
                      ZerospinError.isZerospinError(error)
                        ? error
                        : new ZerospinError({
                            code: 'service-frontend-signature-invalid',
                            message:
                              'Configured service frontend signature does not match its controller schema after online transport returned',
                            cause: ZerospinError.prettyUnknownFailure(error),
                          }),
                    ),
                  ),
            }).pipe(Effect.either),
          );
          if (Either.isLeft(regained)) {
            const isRegainTransportFailure =
              regained.left.code ===
                'service-frontend-admission-transport-failed' ||
              regained.left.code === 'async-failed' ||
              regained.left.cause?.includes('fetch failed') === true ||
              regained.left.cause?.includes('ECONNREFUSED') === true ||
              regained.left.cause?.includes('NetworkError') === true;
            if (isRegainTransportFailure) {
              return;
            }
            if (
              regained.left.code ===
                'service-frontend-admission-target-mismatch' &&
              regained.left.extra !== null &&
              regained.left.extra.expectedServiceName ===
                regained.left.extra.serviceName &&
              regained.left.extra.expectedActorName ===
                regained.left.extra.actorName &&
              regained.left.extra.expectedFrontendName ===
                regained.left.extra.frontendName &&
              regained.left.extra.expectedFrontendVersion !==
                regained.left.extra.frontendVersion
            ) {
              // The same authored service target now requires another
              // compiled frontend version. Keep every mounted Provider on its
              // readable replica while the controller reports update-required.
              return 'update-required';
            }
            const isAuthorityRejection =
              String(regained.left.code).includes('signature-invalid') ||
              String(regained.left.code).includes('authentication') ||
              String(regained.left.code).includes('authorization') ||
              String(regained.left.code).includes('authenticate') ||
              String(regained.left.code).includes('authorize') ||
              String(regained.left.code).includes('authenticator') ||
              regained.left.code ===
                'service-frontend-admission-target-mismatch';
            if (!isAuthorityRejection) {
              return;
            }
            await Runtime.runPromise(runtime)(
              browserPartitionController.invalidateCachedServiceFrontendLocators(
                {
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  error: regained.left,
                  frontend,
                },
              ),
            );
            return;
          }

          const releaseRegainedFrontendApi = regained.right.releaseFrontendApi;
          if (
            regained.right.identity.systemId !== identity.systemId ||
            regained.right.identity.serviceName !== identity.serviceName ||
            regained.right.identity.actorId !== identity.actorId ||
            regained.right.identity.actorName !== identity.actorName ||
            regained.right.identity.frontendName !== identity.frontendName
          ) {
            releaseRegainedFrontendApi();
            await Runtime.runPromise(runtime)(
              browserPartitionController.invalidateCachedServiceFrontendLocators(
                {
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  frontend,
                },
              ),
            );
            return;
          }

          const regainedFrontendSpecHash = await Runtime.runPromise(runtime)(
            makeFrontendSpecHash(regained.right.frontendSpec).pipe(
              Effect.either,
            ),
          );
          if (
            Either.isLeft(regainedFrontendSpecHash) ||
            regainedFrontendSpecHash.right !== compiledFrontendSpecHash ||
            regained.right.identity.frontendVersion !== frontend.version
          ) {
            releaseRegainedFrontendApi();
            return 'update-required';
          }

          if (
            regained.right.identity.generationId === identity.generationId
          ) {
            // An exact regain only confirms that authority and transport
            // returned for the active generation. The registered provider
            // already owns fresh one-shot operations for this replica.
            releaseRegainedFrontendApi();
            return;
          }

          releaseRegainedFrontendApi();
          const upgraded = await Runtime.runPromise(runtime)(
            browserPartitionController
              .acquireServiceFrontendReplica({
                frontend,
                apiUrl,
                publishableKey: publishableKeyValue,
                systemId: regained.right.identity.systemId,
                generationId: regained.right.identity.generationId,
                systemVersion: regained.right.identity.systemVersion,
                serviceName: regained.right.identity.serviceName,
                actorId: regained.right.identity.actorId,
                actorName: regained.right.identity.actorName,
                frontendName: regained.right.identity.frontendName,
                frontendVersion: regained.right.identity.frontendVersion,
                frontendSpec: regained.right.frontendSpec,
                frontendSpecHash: regainedFrontendSpecHash.right,
                authority: 'online',
                role: 'active',
                commissionOwnerId: null,
                network: {
                  getFrontendState: () =>
                    Runtime.runPromise(runtime)(
                      encodeRpc(
                        Effect.acquireUseRelease(
                          fetchServiceFrontend({
                            frontend,
                            generateSignature: () =>
                              browserPartitionController
                                .getServiceGenerateSignature(frontend)()
                                .pipe(
                                  Effect.flatMap(
                                    Schema.decodeUnknown(frontend.signature),
                                  ),
                                  Effect.mapError(error =>
                                    ZerospinError.isZerospinError(error)
                                      ? error
                                      : new ZerospinError({
                                          code:
                                            'service-frontend-signature-invalid',
                                          message:
                                            'Configured service frontend state signature does not match its controller schema',
                                          cause:
                                            ZerospinError.prettyUnknownFailure(
                                              error,
                                            ),
                                        }),
                                  ),
                                ),
                          }).pipe(
                            Effect.mapError(error =>
                              error.code ===
                                'service-frontend-admission-target-mismatch' &&
                              error.extra !== null &&
                              error.extra.expectedServiceName ===
                                error.extra.serviceName &&
                              error.extra.expectedActorName ===
                                error.extra.actorName &&
                              error.extra.expectedFrontendName ===
                                error.extra.frontendName &&
                              error.extra.expectedFrontendVersion !==
                                error.extra.frontendVersion
                                ? new ZerospinError({
                                    code: 'frontend-version-changed',
                                    message:
                                      'The authenticated service frontend now requires a different compiled version',
                                    cause: ZerospinError.stringify(error),
                                  })
                                : error,
                            ),
                          ),
                          currentFrontend =>
                            Effect.gen(function* () {
                              if (
                                currentFrontend.identity.systemId !==
                                  regained.right.identity.systemId ||
                                currentFrontend.identity.serviceName !==
                                  regained.right.identity.serviceName ||
                                currentFrontend.identity.actorId !==
                                  regained.right.identity.actorId ||
                                currentFrontend.identity.actorName !==
                                  regained.right.identity.actorName ||
                                currentFrontend.identity.frontendName !==
                                  regained.right.identity.frontendName
                              ) {
                                return yield* new ZerospinError({
                                  code:
                                    'service-frontend-authentication-target-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved another target',
                                });
                              }
                              const currentFrontendSpecHash =
                                yield* makeFrontendSpecHash(
                                  currentFrontend.frontendSpec,
                                );
                              if (
                                currentFrontend.identity.frontendVersion !==
                                  regained.right.identity.frontendVersion ||
                                currentFrontendSpecHash !==
                                  regainedFrontendSpecHash.right
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-version-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved another compiled version',
                                });
                              }
                              if (
                                currentFrontend.identity.generationId !==
                                regained.right.identity.generationId
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-generation-changed',
                                  message:
                                    'Fresh service frontend state authentication resolved a successor generation',
                                });
                              }
                              return yield* fetchServiceFrontendState({
                                frontendApi: currentFrontend.frontendApi,
                              });
                            }),
                          currentFrontend =>
                            Effect.sync(currentFrontend.releaseFrontendApi),
                        ).pipe(
                          Effect.tapError(error => {
                            const isTransportFailure =
                              error.code ===
                                'service-frontend-admission-transport-failed' ||
                              error.code === 'async-failed' ||
                              error.cause?.includes('fetch failed') === true ||
                              error.cause?.includes('ECONNREFUSED') === true ||
                              error.cause?.includes('NetworkError') === true;
                            const isAuthorityRejection =
                              String(error.code).includes('signature-invalid') ||
                              String(error.code).includes('authentication') ||
                              String(error.code).includes('authorization') ||
                              String(error.code).includes('authenticate') ||
                              String(error.code).includes('authorize') ||
                              String(error.code).includes('authenticator') ||
                              error.code ===
                                'service-frontend-admission-target-mismatch';
                            return isTransportFailure ||
                              error.code === 'frontend-version-changed' ||
                              error.code === 'frontend-generation-changed' ||
                              !isAuthorityRejection
                              ? Effect.void
                              : browserPartitionController.invalidateCachedServiceFrontendLocators(
                                  {
                                    apiUrl,
                                    publishableKey: publishableKeyValue,
                                    error,
                                    frontend,
                                  },
                                );
                          }),
                        ),
                      ),
                    ),
                  createFrontendWebSocketTicket: () =>
                    Runtime.runPromise(runtime)(
                      encodeRpc(
                        Effect.acquireUseRelease(
                          fetchServiceFrontend({
                            frontend,
                            generateSignature: () =>
                              browserPartitionController
                                .getServiceGenerateSignature(frontend)()
                                .pipe(
                                  Effect.flatMap(
                                    Schema.decodeUnknown(frontend.signature),
                                  ),
                                  Effect.mapError(error =>
                                    ZerospinError.isZerospinError(error)
                                      ? error
                                      : new ZerospinError({
                                          code:
                                            'service-frontend-signature-invalid',
                                          message:
                                            'Configured service frontend ticket signature does not match its controller schema',
                                          cause:
                                            ZerospinError.prettyUnknownFailure(
                                              error,
                                            ),
                                        }),
                                  ),
                                ),
                          }).pipe(
                            Effect.mapError(error =>
                              error.code ===
                                'service-frontend-admission-target-mismatch' &&
                              error.extra !== null &&
                              error.extra.expectedServiceName ===
                                error.extra.serviceName &&
                              error.extra.expectedActorName ===
                                error.extra.actorName &&
                              error.extra.expectedFrontendName ===
                                error.extra.frontendName &&
                              error.extra.expectedFrontendVersion !==
                                error.extra.frontendVersion
                                ? new ZerospinError({
                                    code: 'frontend-version-changed',
                                    message:
                                      'The authenticated service frontend now requires a different compiled version',
                                    cause: ZerospinError.stringify(error),
                                  })
                                : error,
                            ),
                          ),
                          currentFrontend =>
                            Effect.gen(function* () {
                              if (
                                currentFrontend.identity.systemId !==
                                  regained.right.identity.systemId ||
                                currentFrontend.identity.serviceName !==
                                  regained.right.identity.serviceName ||
                                currentFrontend.identity.actorId !==
                                  regained.right.identity.actorId ||
                                currentFrontend.identity.actorName !==
                                  regained.right.identity.actorName ||
                                currentFrontend.identity.frontendName !==
                                  regained.right.identity.frontendName
                              ) {
                                return yield* new ZerospinError({
                                  code:
                                    'service-frontend-authentication-target-changed',
                                  message:
                                    'Fresh service frontend ticket authentication resolved another target',
                                });
                              }
                              const currentFrontendSpecHash =
                                yield* makeFrontendSpecHash(
                                  currentFrontend.frontendSpec,
                                );
                              if (
                                currentFrontend.identity.frontendVersion !==
                                  regained.right.identity.frontendVersion ||
                                currentFrontendSpecHash !==
                                  regainedFrontendSpecHash.right
                              ) {
                                return yield* new ZerospinError({
                                  code: 'frontend-version-changed',
                                  message:
                                    'Fresh service frontend ticket authentication resolved another compiled version',
                                });
                              }
                              return yield* createServiceFrontendWebSocketTicket(
                                {
                                  frontendApi: currentFrontend.frontendApi,
                                },
                              );
                            }),
                          currentFrontend =>
                            Effect.sync(currentFrontend.releaseFrontendApi),
                        ).pipe(
                          Effect.tapError(error => {
                            const isTransportFailure =
                              error.code ===
                                'service-frontend-admission-transport-failed' ||
                              error.code === 'async-failed' ||
                              error.cause?.includes('fetch failed') === true ||
                              error.cause?.includes('ECONNREFUSED') === true ||
                              error.cause?.includes('NetworkError') === true;
                            const isAuthorityRejection =
                              String(error.code).includes('signature-invalid') ||
                              String(error.code).includes('authentication') ||
                              String(error.code).includes('authorization') ||
                              String(error.code).includes('authenticate') ||
                              String(error.code).includes('authorize') ||
                              String(error.code).includes('authenticator') ||
                              error.code ===
                                'service-frontend-admission-target-mismatch';
                            return isTransportFailure ||
                              error.code === 'frontend-version-changed' ||
                              error.code === 'frontend-generation-changed' ||
                              !isAuthorityRejection
                              ? Effect.void
                              : browserPartitionController.invalidateCachedServiceFrontendLocators(
                                  {
                                    apiUrl,
                                    publishableKey: publishableKeyValue,
                                    error,
                                    frontend,
                                  },
                                );
                          }),
                        ),
                      ),
                    ),
                },
                transportRegain: null,
              })
              .pipe(Effect.either),
          );
          if (Either.isLeft(upgraded)) {
            // Failed transition/preflight must preserve the only discoverable
            // source locator for a later authority retry. The controller
            // retained or released the target capability before returning.
            return;
          }
          return;
        },
      })
      .pipe(
        Effect.tapError(() =>
          Effect.tryPromise({
            try: async () => {
              if (isDatabaseClosed) {
                return;
              }
              isDatabaseClosed = true;
              await db.$client.sqlite3.close(db.$client.db);
            },
            catch: ZerospinError.catch({
              code: 'service-frontend-session-database-close-failed',
              message:
                'Failed to close the online service frontend Provider database after acquisition failure',
            }),
          }).pipe(Effect.ignore),
        ),
      );
    const hydrated = yield* acquisition.hydrateSession({
      sessionId: session.sessionId,
      replaceFrontendState: async frontendReplicaState => {
        await Runtime.runPromise(runtime)(
          applyServiceFrontendReplicaState({
            frontend,
            actorId: frontendReplicaState.actorId,
            systemId: frontendReplicaState.systemId,
            generationId: frontendReplicaState.generationId,
            systemVersion: frontendReplicaState.systemVersion,
            systemWorkerName: frontendReplicaState.systemWorkerName,
            db,
            models: frontend.models,
            frontendReplicaState,
          }),
        );
        currentFrontendIndex = frontendReplicaState.frontendIndex;
        currentReplicaIndex = frontendReplicaState.replicaIndex;
        previousReplicaBlock = null;
        currentActorId = frontendReplicaState.actorId;
        currentSystemId = frontendReplicaState.systemId;
        currentGenerationId = frontendReplicaState.generationId;
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            serviceName: frontendReplicaState.serviceName,
            actorId: frontendReplicaState.actorId,
            systemId: frontendReplicaState.systemId,
            generationId: frontendReplicaState.generationId,
            systemVersion: frontendReplicaState.systemVersion,
            systemWorkerName: frontendReplicaState.systemWorkerName,
            frontendName: frontendReplicaState.frontendName,
            frontendVersion: frontendReplicaState.frontendVersion,
            frontendIndex: currentFrontendIndex,
            replicaIndex: currentReplicaIndex,
            workerState: {
              ...state.workerState,
              status: isWorkerUpdateRequired ? 'update-required' : 'online',
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
              failure: null,
            },
          });
        }
      },
      setDatabaseName: databaseName => {
        const state = session.store.getState();
        if (!state.isInitialized) {
          return;
        }
        session.store.setState({
          workerState: {
            ...state.workerState,
            databaseName,
          },
        });
      },
      setOnline: () => {
        const state = session.store.getState();
        if (!state.isInitialized) {
          return;
        }
        session.store.setState({
          workerState: {
            ...state.workerState,
            status: isWorkerUpdateRequired ? 'update-required' : 'online',
            failure: null,
          },
        });
      },
      handleServiceFrontendReplicaBlock: async frontendReplicaBlock => {
        const outcome = await Runtime.runPromise(runtime)(
          applyServiceFrontendReplicaBlock({
            frontend,
            actorId: currentActorId,
            systemId: currentSystemId,
            generationId: currentGenerationId,
            currentFrontendIndex,
            currentReplicaIndex,
            previousReplicaBlock,
            db,
            models: frontend.models,
            frontendReplicaBlock,
          }),
        );
        if (outcome === 'applied') {
          currentFrontendIndex = frontendReplicaBlock.frontendIndex;
          currentReplicaIndex = frontendReplicaBlock.replicaIndex;
          previousReplicaBlock = frontendReplicaBlock;
        }
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            frontendIndex: currentFrontendIndex,
            replicaIndex: currentReplicaIndex,
            workerState: {
              ...state.workerState,
              status: isWorkerUpdateRequired ? 'update-required' : 'online',
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
            },
          });
        }
      },
      setRepairing: () => {
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: isWorkerUpdateRequired ? 'update-required' : 'repairing',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure: null,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: isWorkerUpdateRequired ? 'update-required' : 'repairing',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure: null,
            },
          });
        }
      },
      setUpdateRequired: () => {
        isWorkerUpdateRequired = true;
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'update-required',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure: state.workerState.failure,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'update-required',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure: state.workerState.failure,
            },
          });
        }
      },
      setFailure: error => {
        const failure: IAnyErrorJson = Schema.encodeSync(ZerospinError.schema)(
          ZerospinError.isZerospinError(error)
            ? error
            : ZerospinError.catch({
                code: 'service-frontend-session-repair-failed',
                message: 'Service frontend main-thread repair failed',
              })(error),
        );
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'failed',
              bootstrapSource: state.workerState.bootstrapSource,
              frontendIndex: state.frontendIndex,
              replicaIndex: state.replicaIndex,
              databaseName: state.workerState.databaseName,
              failure,
            },
          });
        } else {
          session.store.setState({
            workerState: {
              mode: 'shared-worker',
              status: 'failed',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure,
            },
          });
        }
      },
      teardown: async error => {
        const state = session.store.getState();
        const failure: IAnyErrorJson | null =
          error === null
            ? null
            : Schema.encodeSync(ZerospinError.schema)(error);
        session.store.setState({
          sessionId: session.sessionId,
          actorId: null,
          systemId: null,
          generationId: null,
          systemVersion: null,
          systemWorkerName: null,
          serviceName: null,
          actorName: null,
          frontendName: null,
          frontendVersion: null,
          db: null,
          schema: null,
          models: null,
          isInitialized: false,
          frontendIndex: null,
          replicaIndex: null,
          workerState: {
            mode: 'shared-worker',
            status: error === null ? 'released' : 'failed',
            bootstrapSource: null,
            frontendIndex: null,
            replicaIndex: null,
            databaseName: null,
            failure,
          },
          telemetry: state.telemetry,
          telemetryCollector: state.telemetryCollector,
        });
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
        if (isDatabaseClosed) {
          return;
        }
        isDatabaseClosed = true;
        await db.$client.sqlite3.close(db.$client.db);
      },
    });
    const frontendReplicaState = hydrated.serviceFrontendReplicaState;
    session.store.setState({
      sessionId: session.sessionId,
      actorId: frontendReplicaState.actorId,
      systemId: frontendReplicaState.systemId,
      generationId: frontendReplicaState.generationId,
      systemVersion: frontendReplicaState.systemVersion,
      systemWorkerName: frontendReplicaState.systemWorkerName,
      serviceName: frontendReplicaState.serviceName,
      actorName: frontendReplicaState.actorName,
      frontendName: frontendReplicaState.frontendName,
      frontendVersion: frontendReplicaState.frontendVersion,
      db,
      schema: dbConfig.schema,
      models: frontend.models,
      isInitialized: true,
      frontendIndex: frontendReplicaState.frontendIndex,
      replicaIndex: frontendReplicaState.replicaIndex,
      workerState: {
        mode: 'shared-worker',
        status: isWorkerUpdateRequired ? 'update-required' : 'online',
        bootstrapSource: 'replica',
        frontendIndex: frontendReplicaState.frontendIndex,
        replicaIndex: frontendReplicaState.replicaIndex,
        databaseName: hydrated.databaseName,
        failure: null,
      },
    });
    return {
      releaseBrowserSession: hydrated.release,
    };
  }

  const frontendState = yield* fetchServiceFrontendState({
    frontendApi: admitted.right.frontendApi,
  }).pipe(
    Effect.tapError(() =>
      releaseFrontendApi.pipe(
        Effect.zipRight(
          Effect.tryPromise({
            try: async () => {
              if (isDatabaseClosed) {
                return;
              }
              isDatabaseClosed = true;
              await db.$client.sqlite3.close(db.$client.db);
            },
            catch: ZerospinError.catch({
              code: 'service-frontend-session-database-close-failed',
              message:
                'Failed to close the direct service frontend Provider database after state fetch failure',
            }),
          }).pipe(Effect.ignore),
        ),
      ),
    ),
  );
  let currentDirectIdentity = identity;
  let currentDirectStatus:
    | 'connecting'
    | 'replaying'
    | 'online'
    | 'repairing'
    | 'update-required'
    | 'failed' = 'connecting';
  yield* applyServiceFrontendState({
    frontend,
    actorId: currentDirectIdentity.actorId,
    systemId: currentDirectIdentity.systemId,
    generationId: currentDirectIdentity.generationId,
    systemVersion: currentDirectIdentity.systemVersion,
    systemWorkerName: currentDirectIdentity.systemWorkerName,
    db,
    models: frontend.models,
    frontendState,
  }).pipe(
    Effect.tapError(() =>
      releaseFrontendApi.pipe(
        Effect.zipRight(
          Effect.tryPromise({
            try: async () => {
              if (isDatabaseClosed) {
                return;
              }
              isDatabaseClosed = true;
              await db.$client.sqlite3.close(db.$client.db);
            },
            catch: ZerospinError.catch({
              code: 'service-frontend-session-database-close-failed',
              message:
                'Failed to close the direct service frontend Provider database after state application failure',
            }),
          }).pipe(Effect.ignore),
        ),
      ),
    ),
  );
  currentFrontendIndex = frontendState.frontendIndex;

  const releaseFrontendWebSocket = yield* acquireServiceFrontendWebSocket({
    frontend,
    frontendApi: admitted.right.frontendApi,
    releaseFrontendApi: admitted.right.releaseFrontendApi,
    identity: currentDirectIdentity,
    getFrontendIndex: () => currentFrontendIndex,
    replaceFrontendState: frontendReplacement =>
      applyServiceFrontendState({
        frontend,
        actorId: currentDirectIdentity.actorId,
        systemId: currentDirectIdentity.systemId,
        generationId: currentDirectIdentity.generationId,
        systemVersion: currentDirectIdentity.systemVersion,
        systemWorkerName: currentDirectIdentity.systemWorkerName,
        db,
        models: frontend.models,
        frontendState: frontendReplacement,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            currentFrontendIndex = frontendReplacement.frontendIndex;
          }),
        ),
      ),
    handleServiceFrontendLineageBlock: serviceFrontendLineageBlock => {
      if (serviceFrontendLineageBlock.kind === 'generation-boundary') {
        if (
          serviceFrontendLineageBlock.frontendIndex !==
          currentFrontendIndex + 1
        ) {
          return Effect.fail(
            new ZerospinError({
              code: 'service-frontend-direct-boundary-index-gap',
              message:
                'Direct service frontend boundary is not the exact next frontend index',
            }),
          );
        }
        return Effect.sync(() => {
          currentFrontendIndex = serviceFrontendLineageBlock.frontendIndex;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              frontendIndex: currentFrontendIndex,
              workerState: {
                ...state.workerState,
                frontendIndex: currentFrontendIndex,
              },
            });
          }
        });
      }
      return applyServiceFrontendBlock({
        frontend,
        actorId: currentDirectIdentity.actorId,
        currentFrontendIndex,
        db,
        models: frontend.models,
        frontendBlock: serviceFrontendLineageBlock.frontendBlock,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            currentFrontendIndex =
              serviceFrontendLineageBlock.frontendBlock.frontendIndex;
            const state = session.store.getState();
            if (state.isInitialized) {
              session.store.setState({
                frontendIndex: currentFrontendIndex,
                workerState: {
                  ...state.workerState,
                  status:
                    currentDirectStatus === 'update-required'
                      ? 'update-required'
                      : 'online',
                  frontendIndex: currentFrontendIndex,
                },
              });
            }
          }),
        ),
      );
    },
    regainFrontendApi: () =>
      Effect.gen(function* () {
        const regained = yield* fetchServiceFrontend({
          frontend,
          generateSignature: () =>
            browserPartitionController
              .getServiceGenerateSignature(frontend)()
              .pipe(
                Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                Effect.mapError(error =>
                  ZerospinError.isZerospinError(error)
                    ? error
                    : new ZerospinError({
                        code: 'service-frontend-transport-regain-signature-invalid',
                        message:
                          'Configured service frontend transport-regain signature does not match its controller schema',
                        cause: ZerospinError.prettyUnknownFailure(error),
                      }),
                ),
              ),
        }).pipe(Effect.either);
        if (Either.isLeft(regained)) {
          if (
            regained.left.code ===
              'service-frontend-admission-target-mismatch' &&
            regained.left.extra !== null &&
            regained.left.extra.expectedServiceName ===
              regained.left.extra.serviceName &&
            regained.left.extra.expectedActorName ===
              regained.left.extra.actorName &&
            regained.left.extra.expectedFrontendName ===
              regained.left.extra.frontendName &&
            regained.left.extra.expectedFrontendVersion !==
              regained.left.extra.frontendVersion
          ) {
            // The mounted controller cannot safely consume state for the new
            // version. Preserve its current read-only database.
            return null;
          }
          return yield* regained.left;
        }

        const releaseRegainedFrontendApi = Effect.sync(
          regained.right.releaseFrontendApi,
        );
        if (
          regained.right.identity.systemId !== currentDirectIdentity.systemId ||
          regained.right.identity.serviceName !==
            currentDirectIdentity.serviceName ||
          regained.right.identity.actorId !== currentDirectIdentity.actorId ||
          regained.right.identity.actorName !==
            currentDirectIdentity.actorName ||
          regained.right.identity.frontendName !==
            currentDirectIdentity.frontendName ||
          regained.right.identity.frontendVersion !==
            currentDirectIdentity.frontendVersion
        ) {
          yield* releaseRegainedFrontendApi;
          return yield* new ZerospinError({
            code: 'service-frontend-transport-regain-authority-target-mismatch',
            message:
              'Reauthenticated service frontend transport does not match the readable direct replica target',
          });
        }

        const regainedFrontendSpecHash = yield* makeFrontendSpecHash(
          regained.right.frontendSpec,
        ).pipe(Effect.tapError(() => releaseRegainedFrontendApi));
        if (regainedFrontendSpecHash !== compiledFrontendSpecHash) {
          yield* releaseRegainedFrontendApi;
          return yield* new ZerospinError({
            code: 'service-frontend-transport-regain-compiled-spec-mismatch',
            message:
              'Reauthenticated service frontend transport spec does not match the readable direct replica controller',
          });
        }

        return {
          frontendApi: regained.right.frontendApi,
          releaseFrontendApi: regained.right.releaseFrontendApi,
          identity: regained.right.identity,
        };
      }),
    transitionToTarget: target =>
      Effect.gen(function* () {
        const targetAdmission = yield* fetchServiceFrontend({
          frontend,
          generateSignature: () =>
            browserPartitionController
              .getServiceGenerateSignature(frontend)()
              .pipe(
                Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                Effect.mapError(error =>
                  ZerospinError.isZerospinError(error)
                    ? error
                    : new ZerospinError({
                        code: 'service-frontend-transition-signature-invalid',
                        message:
                          'Configured service frontend transition signature does not match its controller schema',
                        cause: ZerospinError.prettyUnknownFailure(error),
                      }),
                ),
              ),
        }).pipe(Effect.either);
        if (Either.isLeft(targetAdmission)) {
          return yield* targetAdmission.left;
        }

        const releaseTargetFrontendApi = Effect.sync(
          targetAdmission.right.releaseFrontendApi,
        );
        if (
          targetAdmission.right.identity.systemId !== target.systemId ||
          targetAdmission.right.identity.generationId !== target.generationId ||
          targetAdmission.right.identity.serviceName !== target.serviceName ||
          targetAdmission.right.identity.actorId !== target.actorId ||
          targetAdmission.right.identity.actorName !== target.actorName ||
          targetAdmission.right.identity.frontendName !== target.frontendName ||
          targetAdmission.right.identity.frontendVersion !==
            target.frontendVersion
        ) {
          yield* releaseTargetFrontendApi;
          return yield* new ZerospinError({
            code: 'service-frontend-transition-authority-target-mismatch',
            message:
              'Reauthenticated service frontend authority does not match the requested transition target',
          });
        }

        const targetFrontendSpecHash = yield* makeFrontendSpecHash(
          targetAdmission.right.frontendSpec,
        ).pipe(Effect.tapError(() => releaseTargetFrontendApi));
        if (targetFrontendSpecHash !== compiledFrontendSpecHash) {
          yield* releaseTargetFrontendApi;
          return null;
        }

        const targetFrontendState = yield* fetchServiceFrontendState({
          frontendApi: targetAdmission.right.frontendApi,
        }).pipe(Effect.tapError(() => releaseTargetFrontendApi));
        yield* applyServiceFrontendState({
          frontend,
          actorId: targetAdmission.right.identity.actorId,
          systemId: targetAdmission.right.identity.systemId,
          generationId: targetAdmission.right.identity.generationId,
          systemVersion: targetAdmission.right.identity.systemVersion,
          systemWorkerName: targetAdmission.right.identity.systemWorkerName,
          db,
          models: frontend.models,
          frontendState: targetFrontendState,
        }).pipe(Effect.tapError(() => releaseTargetFrontendApi));

        currentDirectIdentity = targetAdmission.right.identity;
        currentFrontendIndex = targetFrontendState.frontendIndex;
        const state = session.store.getState();
        if (state.isInitialized) {
          session.store.setState({
            actorId: currentDirectIdentity.actorId,
            systemId: currentDirectIdentity.systemId,
            generationId: currentDirectIdentity.generationId,
            systemVersion: currentDirectIdentity.systemVersion,
            systemWorkerName: currentDirectIdentity.systemWorkerName,
            serviceName: currentDirectIdentity.serviceName,
            actorName: currentDirectIdentity.actorName,
            frontendName: currentDirectIdentity.frontendName,
            frontendVersion: currentDirectIdentity.frontendVersion,
            frontendIndex: currentFrontendIndex,
            workerState: {
              ...state.workerState,
              status: 'connecting',
              frontendIndex: currentFrontendIndex,
            },
          });
        }
        return {
          frontendApi: targetAdmission.right.frontendApi,
          releaseFrontendApi: targetAdmission.right.releaseFrontendApi,
          identity: targetAdmission.right.identity,
        };
      }),
    handleAuthorityFailure: error =>
      Effect.promise(async () => {
        const isAuthorityRejection =
          String(error.code).includes('signature-invalid') ||
          String(error.code).includes('authentication') ||
          String(error.code).includes('authorization') ||
          String(error.code).includes('authenticate') ||
          String(error.code).includes('authorize') ||
          String(error.code).includes('authenticator') ||
          String(error.code).includes('authority') ||
          String(error.code).includes('identity') ||
          error.code === 'service-frontend-admission-target-mismatch' ||
          error.code ===
            'service-frontend-websocket-regained-target-mismatch' ||
          error.code ===
            'service-frontend-websocket-transition-result-mismatch';
        if (isAuthorityRejection) {
          await Runtime.runPromise(runtime)(
            browserPartitionController.invalidateCachedServiceFrontendLocators(
              {
                apiUrl,
                publishableKey: publishableKeyValue,
                error,
                frontend,
              },
            ),
          );
        }
        const state = session.store.getState();
        const failure: IAnyErrorJson = Schema.encodeSync(ZerospinError.schema)(
          error,
        );
        session.store.setState({
          sessionId: session.sessionId,
          actorId: null,
          systemId: null,
          generationId: null,
          systemVersion: null,
          systemWorkerName: null,
          serviceName: null,
          actorName: null,
          frontendName: null,
          frontendVersion: null,
          db: null,
          schema: null,
          models: null,
          isInitialized: false,
          frontendIndex: null,
          replicaIndex: null,
          workerState: {
            mode: 'direct',
            status: 'failed',
            bootstrapSource: null,
            frontendIndex: null,
            replicaIndex: null,
            databaseName: null,
            failure,
          },
          telemetry: state.telemetry,
          telemetryCollector: state.telemetryCollector,
        });
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
        if (isDatabaseClosed) {
          return;
        }
        isDatabaseClosed = true;
        await db.$client.sqlite3.close(db.$client.db);
      }),
    setStatus: status => {
      currentDirectStatus = status;
      const state = session.store.getState();
      if (state.isInitialized) {
        session.store.setState({
          workerState: {
            mode: 'direct',
            status,
            bootstrapSource: state.workerState.bootstrapSource,
            frontendIndex: state.frontendIndex,
            replicaIndex: null,
            databaseName: null,
            failure: state.workerState.failure,
          },
        });
      } else {
        session.store.setState({
          workerState: {
            mode: 'direct',
            status,
            bootstrapSource: null,
            frontendIndex: null,
            replicaIndex: null,
            databaseName: null,
            failure: null,
          },
        });
      }
    },
  }).pipe(
    Effect.tapError(() =>
      Effect.tryPromise({
        try: async () => {
          if (isDatabaseClosed) {
            return;
          }
          isDatabaseClosed = true;
          await db.$client.sqlite3.close(db.$client.db);
        },
        catch: ZerospinError.catch({
          code: 'service-frontend-session-database-close-failed',
          message:
            'Failed to close the direct service frontend Provider database after WebSocket acquisition failure',
        }),
      }).pipe(Effect.ignore),
    ),
  );

  session.store.setState({
    sessionId: session.sessionId,
    actorId: currentDirectIdentity.actorId,
    systemId: currentDirectIdentity.systemId,
    generationId: currentDirectIdentity.generationId,
    systemVersion: currentDirectIdentity.systemVersion,
    systemWorkerName: currentDirectIdentity.systemWorkerName,
    serviceName: currentDirectIdentity.serviceName,
    actorName: currentDirectIdentity.actorName,
    frontendName: currentDirectIdentity.frontendName,
    frontendVersion: currentDirectIdentity.frontendVersion,
    db,
    schema: dbConfig.schema,
    models: frontend.models,
    isInitialized: true,
    frontendIndex: currentFrontendIndex,
    replicaIndex: null,
    workerState: {
      mode: 'direct',
      status: currentDirectStatus,
      bootstrapSource: 'network',
      frontendIndex: currentFrontendIndex,
      replicaIndex: null,
      databaseName: null,
      failure: null,
    },
  });

  return {
    releaseBrowserSession: releaseFrontendWebSocket.pipe(
      Effect.zipRight(
        Effect.promise(async () => {
          const state = session.store.getState();
          session.store.setState({
            sessionId: session.sessionId,
            actorId: null,
            systemId: null,
            generationId: null,
            systemVersion: null,
            systemWorkerName: null,
            serviceName: null,
            actorName: null,
            frontendName: null,
            frontendVersion: null,
            db: null,
            schema: null,
            models: null,
            isInitialized: false,
            frontendIndex: null,
            replicaIndex: null,
            workerState: {
              mode: 'direct',
              status: 'released',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure: null,
            },
            telemetry: state.telemetry,
            telemetryCollector: state.telemetryCollector,
          });
          await new Promise<void>(resolve => {
            setTimeout(resolve, 0);
          });
          if (isDatabaseClosed) {
            return;
          }
          isDatabaseClosed = true;
          await db.$client.sqlite3.close(db.$client.db);
        }),
      ),
    ),
  };
}, annotateFunctionSpan);
