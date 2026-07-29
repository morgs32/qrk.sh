'use client';

import { useCallback, useContext, useRef } from 'react';

import type { Async } from '@zerospin/core/async/Async';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
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
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { createFrontendWebSocketTicket } from '@zerospin/frontend/createFrontendWebSocketTicket';
import { createServiceFrontendWebSocketTicket } from '@zerospin/frontend/createServiceFrontendWebSocketTicket';
import { fetchFrontend } from '@zerospin/frontend/fetchFrontend';
import { fetchFrontendState } from '@zerospin/frontend/fetchFrontendState';
import { fetchServiceFrontend } from '@zerospin/frontend/fetchServiceFrontend';
import { fetchServiceFrontendState } from '@zerospin/frontend/fetchServiceFrontendState';
import { pushFrontendCommands } from '@zerospin/frontend/pushFrontendCommands';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type ITelemetryCollector,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Either, Redacted, Runtime, Schema } from 'effect';

import { BrowserPartitionControllerContext } from './makeBrowserPartitionController';
import type {
  IReactFrontend,
  IReactServiceFrontend,
  ISessionProviderServices,
} from './types';

let nextFrontendCommissionOwnerId = 0;

export function useCommissionFrontendReplica<
  FRONTEND extends IFrontendController,
>(
  reactFrontend: Pick<
    IReactFrontend<FRONTEND>,
    'kind' | 'frontend' | 'sessionRuntime'
  >,
): Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}>;
export function useCommissionFrontendReplica<
  FRONTEND extends IServiceFrontendController,
>(
  reactFrontend: Pick<
    IReactServiceFrontend<FRONTEND>,
    'kind' | 'frontend' | 'sessionRuntime'
  >,
): Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}>;
export function useCommissionFrontendReplica(
  reactFrontend:
    | Pick<
        IReactFrontend<IFrontendController>,
        'kind' | 'frontend' | 'sessionRuntime'
      >
    | Pick<
        IReactServiceFrontend<IServiceFrontendController>,
        'kind' | 'frontend' | 'sessionRuntime'
      >,
): Readonly<{
  commission(): Promise<Either.Either<void, IAnyError>>;
  release(): Promise<Either.Either<void, IAnyError>>;
}> {
  const browserPartitionController = useContext(
    BrowserPartitionControllerContext,
  );
  if (browserPartitionController === null) {
    throw new Error(
      'ZerospinConfig with partitionKey must be mounted above useCommissionFrontendReplica.',
    );
  }

  const commissionOwnerIdRef = useRef<string | null>(null);
  if (commissionOwnerIdRef.current === null) {
    nextFrontendCommissionOwnerId += 1;
    commissionOwnerIdRef.current = `frontend-commission-${nextFrontendCommissionOwnerId}`;
  }
  const releaseCommissionOwnerRef = useRef<Effect.Effect<
    void,
    IAnyError
  > | null>(null);
  const telemetryCollectorRef = useRef<ITelemetryCollector | null>(null);
  let telemetryCollector = telemetryCollectorRef.current;
  if (telemetryCollector === null) {
    telemetryCollector = makeTelemetryCollector();
    telemetryCollectorRef.current = telemetryCollector;
  }
  const pendingCommissionRef = useRef<Promise<
    Either.Either<void, IAnyError>
  > | null>(null);
  const releaseRequestedRef = useRef(false);

  const commission = useCallback(() => {
    if (releaseCommissionOwnerRef.current !== null) {
      return Promise.resolve(Either.right(undefined));
    }
    if (pendingCommissionRef.current !== null) {
      return pendingCommissionRef.current;
    }
    if (!browserPartitionController.isSharedWorkerEnabled) {
      return Promise.resolve(
        Either.left(
          new ZerospinError({
            code: 'frontend-commissioning-unavailable-in-direct-mode',
            message:
              'Frontend replica commissioning requires SharedWorker mode',
          }),
        ),
      );
    }

    releaseRequestedRef.current = false;
    const commissionOwnerId = commissionOwnerIdRef.current;
    if (commissionOwnerId === null) {
      return Promise.resolve(
        Either.left(
          new ZerospinError({
            code: 'frontend-commission-owner-unavailable',
            message: 'Frontend commission owner was not initialized',
          }),
        ),
      );
    }

    const commissionEffect = Effect.gen(function* () {
      const apiUrl = yield* ZerospinApisUrlService;
      const publishableKey = yield* PublishableKeyService;
      const publishableKeyValue = Redacted.value(publishableKey);
      const runtime = yield* Effect.runtime<
        Async | PublishableKey | TelemetryCollector | ZerospinApisUrl
      >();
      yield* Effect.context<ISessionProviderServices>();

      if (reactFrontend.kind === 'account') {
        const frontend = reactFrontend.frontend;
        const configuredGenerateSignature =
          browserPartitionController.getAccountGenerateSignature(frontend);
        const admitted = yield* fetchFrontend({
          frontend,
          generateSignature: () =>
            configuredGenerateSignature().pipe(
              Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
              Effect.mapError(error =>
                ZerospinError.isZerospinError(error)
                  ? error
                  : new ZerospinError({
                      code: 'frontend-commission-signature-invalid',
                      message:
                        'Configured account frontend signature does not match its controller schema',
                      cause: ZerospinError.prettyUnknownFailure(error),
                    }),
              ),
            ),
        }).pipe(
          Effect.mapError(error => {
            if (
              error.code === 'frontend-admission-target-mismatch' &&
              error.extra !== null &&
              error.extra.expectedAccountName === error.extra.accountName &&
              error.extra.expectedActorName === error.extra.actorName &&
              error.extra.expectedFrontendName === error.extra.frontendName &&
              error.extra.expectedFrontendVersion !==
                error.extra.frontendVersion
            ) {
              return new ZerospinError({
                code: 'frontend-version-changed',
                message:
                  'The account frontend candidate is not yet ordinarily routable',
                cause: error.message,
                extra: error.extra,
              });
            }
            return error;
          }),
          Effect.tapError(error => {
            const isAuthorityRejection =
              String(error.code).includes('signature-invalid') ||
              String(error.code).includes('authentication') ||
              String(error.code).includes('authorization') ||
              String(error.code).includes('authenticate') ||
              String(error.code).includes('authorize') ||
              String(error.code).includes('authenticator') ||
              error.code === 'frontend-admission-target-mismatch';
            return isAuthorityRejection
              ? browserPartitionController.invalidateCachedAccountFrontendLocators(
                  {
                    apiUrl,
                    publishableKey: publishableKeyValue,
                    error,
                    frontend,
                  },
                )
              : Effect.void;
          }),
        );
        const releaseFrontendApi = Effect.sync(admitted.releaseFrontendApi);
        const compiledFrontendSpec = makeFrontendControllerSpec(frontend);
        const compiledFrontendSpecHash = yield* makeFrontendSpecHash(
          compiledFrontendSpec,
        ).pipe(Effect.tapError(() => releaseFrontendApi));
        const admittedFrontendSpecHash = yield* makeFrontendSpecHash(
          admitted.frontendSpec,
        ).pipe(Effect.tapError(() => releaseFrontendApi));
        if (compiledFrontendSpecHash !== admittedFrontendSpecHash) {
          yield* releaseFrontendApi;
          return yield* new ZerospinError({
            code: 'frontend-commission-compiled-spec-mismatch',
            message:
              'Authenticated account frontend spec does not match the commissioned controller',
          });
        }
        yield* releaseFrontendApi;
        const acquisition = yield* browserPartitionController
          .acquireAccountFrontendReplica({
            frontend,
            apiUrl,
            publishableKey: publishableKeyValue,
            systemId: admitted.identity.systemId,
            generationId: admitted.identity.generationId,
            systemVersion: admitted.identity.systemVersion,
            accountId: admitted.identity.accountId,
            accountName: admitted.identity.accountName,
            actorId: admitted.identity.actorId,
            actorName: admitted.identity.actorName,
            frontendName: admitted.identity.frontendName,
            frontendVersion: admitted.identity.frontendVersion,
            frontendSpec: admitted.frontendSpec,
            frontendSpecHash: compiledFrontendSpecHash,
            authority: 'online',
            role: 'commissioned',
            commissionOwnerId,
            network: {
              getFrontendState: () =>
                Runtime.runPromise(runtime)(
                  encodeRpc(
                    Effect.acquireUseRelease(
                      fetchFrontend({
                        frontend,
                        generateSignature: () =>
                          configuredGenerateSignature().pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code:
                                      'frontend-commission-state-signature-invalid',
                                    message:
                                      'Configured account frontend state signature does not match its controller schema',
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
                            'frontend-admission-target-mismatch' &&
                          error.extra !== null &&
                          error.extra.expectedAccountName ===
                            error.extra.accountName &&
                          error.extra.expectedActorName ===
                            error.extra.actorName &&
                          error.extra.expectedFrontendName ===
                            error.extra.frontendName &&
                          error.extra.expectedFrontendVersion !==
                            error.extra.frontendVersion
                            ? new ZerospinError({
                                code: 'frontend-version-changed',
                                message:
                                  'The commissioned account frontend now requires a different compiled version',
                                cause: ZerospinError.stringify(error),
                              })
                            : error,
                        ),
                      ),
                      currentFrontend =>
                        Effect.gen(function* () {
                          if (
                            currentFrontend.identity.systemId !==
                              admitted.identity.systemId ||
                            currentFrontend.identity.accountId !==
                              admitted.identity.accountId ||
                            currentFrontend.identity.accountName !==
                              admitted.identity.accountName ||
                            currentFrontend.identity.actorId !==
                              admitted.identity.actorId ||
                            currentFrontend.identity.actorName !==
                              admitted.identity.actorName ||
                            currentFrontend.identity.frontendName !==
                              admitted.identity.frontendName
                          ) {
                            return yield* new ZerospinError({
                              code:
                                'frontend-commission-authentication-target-changed',
                              message:
                                'Fresh commissioned account frontend state authentication resolved another target',
                            });
                          }
                          const currentFrontendSpecHash =
                            yield* makeFrontendSpecHash(
                              currentFrontend.frontendSpec,
                            );
                          if (
                            currentFrontend.identity.frontendVersion !==
                              admitted.identity.frontendVersion ||
                            currentFrontendSpecHash !== compiledFrontendSpecHash
                          ) {
                            return yield* new ZerospinError({
                              code: 'frontend-version-changed',
                              message:
                                'Fresh commissioned account frontend state authentication resolved another compiled version',
                            });
                          }
                          if (
                            currentFrontend.identity.generationId !==
                            admitted.identity.generationId
                          ) {
                            return yield* new ZerospinError({
                              code: 'frontend-generation-changed',
                              message:
                                'Fresh commissioned account frontend state authentication resolved a successor generation',
                            });
                          }
                          return yield* fetchFrontendState({
                            frontendApi: currentFrontend.frontendApi,
                          });
                        }),
                      currentFrontend =>
                        Effect.sync(currentFrontend.releaseFrontendApi),
                    ).pipe(
                      Effect.tapError(error => {
                        const isAuthorityRejection =
                          String(error.code).includes('signature-invalid') ||
                          String(error.code).includes('authentication') ||
                          String(error.code).includes('authorization') ||
                          String(error.code).includes('authenticate') ||
                          String(error.code).includes('authorize') ||
                          String(error.code).includes('authenticator') ||
                          error.code === 'frontend-admission-target-mismatch';
                        return isAuthorityRejection
                          ? browserPartitionController.invalidateCachedAccountFrontendLocators(
                              {
                                apiUrl,
                                publishableKey: publishableKeyValue,
                                error,
                                frontend,
                              },
                            )
                          : Effect.void;
                      }),
                    ),
                  ),
                ),
              createFrontendWebSocketTicket: () =>
                Runtime.runPromise(runtime)(
                  encodeRpc(
                    Effect.acquireUseRelease(
                      fetchFrontend({
                        frontend,
                        generateSignature: () =>
                          configuredGenerateSignature().pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code:
                                      'frontend-commission-ticket-signature-invalid',
                                    message:
                                      'Configured account frontend ticket signature does not match its controller schema',
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
                            'frontend-admission-target-mismatch' &&
                          error.extra !== null &&
                          error.extra.expectedAccountName ===
                            error.extra.accountName &&
                          error.extra.expectedActorName ===
                            error.extra.actorName &&
                          error.extra.expectedFrontendName ===
                            error.extra.frontendName &&
                          error.extra.expectedFrontendVersion !==
                            error.extra.frontendVersion
                            ? new ZerospinError({
                                code: 'frontend-version-changed',
                                message:
                                  'The commissioned account frontend now requires a different compiled version',
                                cause: ZerospinError.stringify(error),
                              })
                            : error,
                        ),
                      ),
                      currentFrontend =>
                        Effect.gen(function* () {
                          if (
                            currentFrontend.identity.systemId !==
                              admitted.identity.systemId ||
                            currentFrontend.identity.accountId !==
                              admitted.identity.accountId ||
                            currentFrontend.identity.accountName !==
                              admitted.identity.accountName ||
                            currentFrontend.identity.actorId !==
                              admitted.identity.actorId ||
                            currentFrontend.identity.actorName !==
                              admitted.identity.actorName ||
                            currentFrontend.identity.frontendName !==
                              admitted.identity.frontendName
                          ) {
                            return yield* new ZerospinError({
                              code:
                                'frontend-commission-authentication-target-changed',
                              message:
                                'Fresh commissioned account frontend ticket authentication resolved another target',
                            });
                          }
                          const currentFrontendSpecHash =
                            yield* makeFrontendSpecHash(
                              currentFrontend.frontendSpec,
                            );
                          if (
                            currentFrontend.identity.frontendVersion !==
                              admitted.identity.frontendVersion ||
                            currentFrontendSpecHash !== compiledFrontendSpecHash
                          ) {
                            return yield* new ZerospinError({
                              code: 'frontend-version-changed',
                              message:
                                'Fresh commissioned account frontend ticket authentication resolved another compiled version',
                            });
                          }
                          return yield* createFrontendWebSocketTicket({
                            frontendApi: currentFrontend.frontendApi,
                          });
                        }),
                      currentFrontend =>
                        Effect.sync(currentFrontend.releaseFrontendApi),
                    ).pipe(
                      Effect.tapError(error => {
                        const isAuthorityRejection =
                          String(error.code).includes('signature-invalid') ||
                          String(error.code).includes('authentication') ||
                          String(error.code).includes('authorization') ||
                          String(error.code).includes('authenticate') ||
                          String(error.code).includes('authorize') ||
                          String(error.code).includes('authenticator') ||
                          error.code === 'frontend-admission-target-mismatch';
                        return isAuthorityRejection
                          ? browserPartitionController.invalidateCachedAccountFrontendLocators(
                              {
                                apiUrl,
                                publishableKey: publishableKeyValue,
                                error,
                                frontend,
                              },
                            )
                          : Effect.void;
                      }),
                    ),
                  ),
                ),
              pushCommands: commands =>
                Runtime.runPromise(runtime)(
                  encodeRpc(
                    Effect.acquireUseRelease(
                      fetchFrontend({
                        frontend,
                        generateSignature: () =>
                          configuredGenerateSignature().pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code:
                                      'frontend-commission-push-signature-invalid',
                                    message:
                                      'Configured account frontend push signature does not match its controller schema',
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
                            'frontend-admission-target-mismatch' &&
                          error.extra !== null &&
                          error.extra.expectedAccountName ===
                            error.extra.accountName &&
                          error.extra.expectedActorName ===
                            error.extra.actorName &&
                          error.extra.expectedFrontendName ===
                            error.extra.frontendName &&
                          error.extra.expectedFrontendVersion !==
                            error.extra.frontendVersion
                            ? new ZerospinError({
                                code: 'frontend-version-changed',
                                message:
                                  'The commissioned account frontend now requires a different compiled version',
                                cause: ZerospinError.stringify(error),
                              })
                            : error,
                        ),
                      ),
                      currentFrontend =>
                        Effect.gen(function* () {
                          if (
                            currentFrontend.identity.systemId !==
                              admitted.identity.systemId ||
                            currentFrontend.identity.accountId !==
                              admitted.identity.accountId ||
                            currentFrontend.identity.accountName !==
                              admitted.identity.accountName ||
                            currentFrontend.identity.actorId !==
                              admitted.identity.actorId ||
                            currentFrontend.identity.actorName !==
                              admitted.identity.actorName ||
                            currentFrontend.identity.frontendName !==
                              admitted.identity.frontendName
                          ) {
                            return yield* new ZerospinError({
                              code:
                                'frontend-commission-authentication-target-changed',
                              message:
                                'Fresh commissioned account frontend push authentication resolved another target',
                            });
                          }
                          const currentFrontendSpecHash =
                            yield* makeFrontendSpecHash(
                              currentFrontend.frontendSpec,
                            );
                          if (
                            currentFrontend.identity.frontendVersion !==
                              admitted.identity.frontendVersion ||
                            currentFrontendSpecHash !== compiledFrontendSpecHash
                          ) {
                            return yield* new ZerospinError({
                              code: 'frontend-version-changed',
                              message:
                                'Fresh commissioned account frontend push authentication resolved another compiled version',
                            });
                          }
                          if (
                            currentFrontend.identity.generationId !==
                            admitted.identity.generationId
                          ) {
                            return yield* new ZerospinError({
                              code: 'frontend-generation-changed',
                              message:
                                'Fresh commissioned account frontend push authentication resolved a successor generation',
                            });
                          }
                          return yield* pushFrontendCommands({
                            frontendApi: currentFrontend.frontendApi,
                            commands,
                          });
                        }),
                      currentFrontend =>
                        Effect.sync(currentFrontend.releaseFrontendApi),
                    ).pipe(
                      Effect.tapError(error => {
                        const isAuthorityRejection =
                          String(error.code).includes('signature-invalid') ||
                          String(error.code).includes('authentication') ||
                          String(error.code).includes('authorization') ||
                          String(error.code).includes('authenticate') ||
                          String(error.code).includes('authorize') ||
                          String(error.code).includes('authenticator') ||
                          error.code === 'frontend-admission-target-mismatch';
                        return isAuthorityRejection
                          ? browserPartitionController.invalidateCachedAccountFrontendLocators(
                              {
                                apiUrl,
                                publishableKey: publishableKeyValue,
                                error,
                                frontend,
                              },
                            )
                          : Effect.void;
                      }),
                    ),
                  ),
                ),
            },
            transportRegain: null,
          });
        browserPartitionController.setCachedAccountFrontendLocator({
          apiUrl,
          publishableKey: publishableKeyValue,
          frontend,
          role: 'commissioned',
          identity: {
            systemName: frontend.systemName,
            accountName: admitted.identity.accountName,
            accountId: admitted.identity.accountId,
            actorName: admitted.identity.actorName,
            actorId: admitted.identity.actorId,
            frontendName: admitted.identity.frontendName,
            frontendVersion: admitted.identity.frontendVersion,
            systemId: admitted.identity.systemId,
            generationId: admitted.identity.generationId,
            systemVersion: admitted.identity.systemVersion,
            systemWorkerName: admitted.identity.systemWorkerName,
          },
        });
        if (releaseRequestedRef.current) {
          yield* acquisition.releaseCommissionOwner;
          return;
        }
        releaseCommissionOwnerRef.current = acquisition.releaseCommissionOwner;
        return;
      }

      const frontend = reactFrontend.frontend;
      const configuredGenerateSignature =
        browserPartitionController.getServiceGenerateSignature(frontend);
      const admitted = yield* fetchServiceFrontend({
        frontend,
        generateSignature: () =>
          configuredGenerateSignature().pipe(
            Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
            Effect.mapError(error =>
              ZerospinError.isZerospinError(error)
                ? error
                : new ZerospinError({
                    code: 'service-frontend-commission-signature-invalid',
                    message:
                      'Configured service frontend signature does not match its controller schema',
                    cause: ZerospinError.prettyUnknownFailure(error),
                  }),
            ),
          ),
      }).pipe(
        Effect.mapError(error => {
          if (
            error.code === 'service-frontend-admission-target-mismatch' &&
            error.extra !== null &&
            error.extra.expectedServiceName === error.extra.serviceName &&
            error.extra.expectedActorName === error.extra.actorName &&
            error.extra.expectedFrontendName === error.extra.frontendName &&
            error.extra.expectedFrontendVersion !== error.extra.frontendVersion
          ) {
            return new ZerospinError({
              code: 'frontend-version-changed',
              message:
                'The service frontend candidate is not yet ordinarily routable',
              cause: error.message,
              extra: error.extra,
            });
          }
          return error;
        }),
        Effect.tapError(error => {
          const isAuthorityRejection =
            String(error.code).includes('signature-invalid') ||
            String(error.code).includes('authentication') ||
            String(error.code).includes('authorization') ||
            String(error.code).includes('authenticate') ||
            String(error.code).includes('authorize') ||
            String(error.code).includes('authenticator') ||
            error.code === 'service-frontend-admission-target-mismatch';
          return isAuthorityRejection
            ? browserPartitionController.invalidateCachedServiceFrontendLocators(
                {
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  error,
                  frontend,
                },
              )
            : Effect.void;
        }),
      );
      const releaseFrontendApi = Effect.sync(admitted.releaseFrontendApi);
      const compiledFrontendSpec = makeServiceFrontendControllerSpec(frontend);
      const compiledFrontendSpecHash = yield* makeFrontendSpecHash(
        compiledFrontendSpec,
      ).pipe(Effect.tapError(() => releaseFrontendApi));
      const admittedFrontendSpecHash = yield* makeFrontendSpecHash(
        admitted.frontendSpec,
      ).pipe(Effect.tapError(() => releaseFrontendApi));
      if (compiledFrontendSpecHash !== admittedFrontendSpecHash) {
        yield* releaseFrontendApi;
        return yield* new ZerospinError({
          code: 'service-frontend-commission-compiled-spec-mismatch',
          message:
            'Authenticated service frontend spec does not match the commissioned controller',
        });
      }
      yield* releaseFrontendApi;
      const acquisition = yield* browserPartitionController
        .acquireServiceFrontendReplica({
          frontend,
          apiUrl,
          publishableKey: publishableKeyValue,
          systemId: admitted.identity.systemId,
          generationId: admitted.identity.generationId,
          systemVersion: admitted.identity.systemVersion,
          serviceName: admitted.identity.serviceName,
          actorId: admitted.identity.actorId,
          actorName: admitted.identity.actorName,
          frontendName: admitted.identity.frontendName,
          frontendVersion: admitted.identity.frontendVersion,
          frontendSpec: admitted.frontendSpec,
          frontendSpecHash: compiledFrontendSpecHash,
          authority: 'online',
          role: 'commissioned',
          commissionOwnerId,
          network: {
            getFrontendState: () =>
              Runtime.runPromise(runtime)(
                encodeRpc(
                  Effect.acquireUseRelease(
                    fetchServiceFrontend({
                      frontend,
                      generateSignature: () =>
                        configuredGenerateSignature().pipe(
                          Effect.flatMap(
                            Schema.decodeUnknown(frontend.signature),
                          ),
                          Effect.mapError(error =>
                            ZerospinError.isZerospinError(error)
                              ? error
                              : new ZerospinError({
                                  code:
                                    'service-frontend-commission-state-signature-invalid',
                                  message:
                                    'Configured service frontend state signature does not match its controller schema',
                                  cause: ZerospinError.prettyUnknownFailure(
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
                                'The commissioned service frontend now requires a different compiled version',
                              cause: ZerospinError.stringify(error),
                            })
                          : error,
                      ),
                    ),
                    currentFrontend =>
                      Effect.gen(function* () {
                        if (
                          currentFrontend.identity.systemId !==
                            admitted.identity.systemId ||
                          currentFrontend.identity.serviceName !==
                            admitted.identity.serviceName ||
                          currentFrontend.identity.actorId !==
                            admitted.identity.actorId ||
                          currentFrontend.identity.actorName !==
                            admitted.identity.actorName ||
                          currentFrontend.identity.frontendName !==
                            admitted.identity.frontendName
                        ) {
                          return yield* new ZerospinError({
                            code:
                              'service-frontend-commission-authentication-target-changed',
                            message:
                              'Fresh commissioned service frontend state authentication resolved another target',
                          });
                        }
                        const currentFrontendSpecHash =
                          yield* makeFrontendSpecHash(
                            currentFrontend.frontendSpec,
                          );
                        if (
                          currentFrontend.identity.frontendVersion !==
                            admitted.identity.frontendVersion ||
                          currentFrontendSpecHash !== compiledFrontendSpecHash
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-version-changed',
                            message:
                              'Fresh commissioned service frontend state authentication resolved another compiled version',
                          });
                        }
                        if (
                          currentFrontend.identity.generationId !==
                          admitted.identity.generationId
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-generation-changed',
                            message:
                              'Fresh commissioned service frontend state authentication resolved a successor generation',
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
                      const isAuthorityRejection =
                        String(error.code).includes('signature-invalid') ||
                        String(error.code).includes('authentication') ||
                        String(error.code).includes('authorization') ||
                        String(error.code).includes('authenticate') ||
                        String(error.code).includes('authorize') ||
                        String(error.code).includes('authenticator') ||
                        error.code ===
                          'service-frontend-admission-target-mismatch';
                      return isAuthorityRejection
                        ? browserPartitionController.invalidateCachedServiceFrontendLocators(
                            {
                              apiUrl,
                              publishableKey: publishableKeyValue,
                              error,
                              frontend,
                            },
                          )
                        : Effect.void;
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
                        configuredGenerateSignature().pipe(
                          Effect.flatMap(
                            Schema.decodeUnknown(frontend.signature),
                          ),
                          Effect.mapError(error =>
                            ZerospinError.isZerospinError(error)
                              ? error
                              : new ZerospinError({
                                  code:
                                    'service-frontend-commission-ticket-signature-invalid',
                                  message:
                                    'Configured service frontend ticket signature does not match its controller schema',
                                  cause: ZerospinError.prettyUnknownFailure(
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
                                'The commissioned service frontend now requires a different compiled version',
                              cause: ZerospinError.stringify(error),
                            })
                          : error,
                      ),
                    ),
                    currentFrontend =>
                      Effect.gen(function* () {
                        if (
                          currentFrontend.identity.systemId !==
                            admitted.identity.systemId ||
                          currentFrontend.identity.serviceName !==
                            admitted.identity.serviceName ||
                          currentFrontend.identity.actorId !==
                            admitted.identity.actorId ||
                          currentFrontend.identity.actorName !==
                            admitted.identity.actorName ||
                          currentFrontend.identity.frontendName !==
                            admitted.identity.frontendName
                        ) {
                          return yield* new ZerospinError({
                            code:
                              'service-frontend-commission-authentication-target-changed',
                            message:
                              'Fresh commissioned service frontend ticket authentication resolved another target',
                          });
                        }
                        const currentFrontendSpecHash =
                          yield* makeFrontendSpecHash(
                            currentFrontend.frontendSpec,
                          );
                        if (
                          currentFrontend.identity.frontendVersion !==
                            admitted.identity.frontendVersion ||
                          currentFrontendSpecHash !== compiledFrontendSpecHash
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-version-changed',
                            message:
                              'Fresh commissioned service frontend ticket authentication resolved another compiled version',
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
                      const isAuthorityRejection =
                        String(error.code).includes('signature-invalid') ||
                        String(error.code).includes('authentication') ||
                        String(error.code).includes('authorization') ||
                        String(error.code).includes('authenticate') ||
                        String(error.code).includes('authorize') ||
                        String(error.code).includes('authenticator') ||
                        error.code ===
                          'service-frontend-admission-target-mismatch';
                      return isAuthorityRejection
                        ? browserPartitionController.invalidateCachedServiceFrontendLocators(
                            {
                              apiUrl,
                              publishableKey: publishableKeyValue,
                              error,
                              frontend,
                            },
                          )
                        : Effect.void;
                    }),
                  ),
                ),
              ),
          },
          transportRegain: null,
        });
      browserPartitionController.setCachedServiceFrontendLocator({
        apiUrl,
        publishableKey: publishableKeyValue,
        frontend,
        role: 'commissioned',
        identity: {
          systemName: frontend.systemName,
          serviceName: admitted.identity.serviceName,
          actorName: admitted.identity.actorName,
          actorId: admitted.identity.actorId,
          frontendName: admitted.identity.frontendName,
          frontendVersion: admitted.identity.frontendVersion,
          systemId: admitted.identity.systemId,
          generationId: admitted.identity.generationId,
          systemVersion: admitted.identity.systemVersion,
          systemWorkerName: admitted.identity.systemWorkerName,
        },
      });
      if (releaseRequestedRef.current) {
        yield* acquisition.releaseCommissionOwner;
        return;
      }
      releaseCommissionOwnerRef.current = acquisition.releaseCommissionOwner;
    });

    const pendingCommission = reactFrontend.sessionRuntime
      .runPromise(
        commissionEffect.pipe(
          Effect.provide(makeTelemetryLayer(telemetryCollector)),
          Effect.either,
        ),
      )
      .finally(() => {
        pendingCommissionRef.current = null;
      });
    pendingCommissionRef.current = pendingCommission;
    return pendingCommission;
  }, [browserPartitionController, reactFrontend, telemetryCollector]);

  const release = useCallback(async () => {
    releaseRequestedRef.current = true;
    const releaseCommissionOwner = releaseCommissionOwnerRef.current;
    if (releaseCommissionOwner === null) {
      return Either.right(undefined);
    }
    releaseCommissionOwnerRef.current = null;
    return reactFrontend.sessionRuntime.runPromise(
      Effect.gen(function* () {
        yield* Effect.context<ISessionProviderServices>();
        return yield* releaseCommissionOwner.pipe(Effect.either);
      }),
    );
  }, [reactFrontend]);

  return { commission, release };
}
