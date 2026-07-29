import type { IActor } from '@zerospin/core/actorController/types';
import type { Async } from '@zerospin/core/async/Async';
import { applyFrontendMutationTx } from '@zerospin/core/contracts/applyFrontendMutationTx';
import { applyMutationInverseTx } from '@zerospin/core/contracts/applyMutationInverseTx';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDrizzleRelationsFromModels } from '@zerospin/core/drizzle/types';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeFrontendSpecHash } from '@zerospin/core/frontendController/makeFrontendSpecHash';
import type {
  IFrontendController,
  InferFrontendModels,
} from '@zerospin/core/frontendController/types';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import {
  PublishableKey as PublishableKeyService,
  type PublishableKey,
} from '@zerospin/core/services/PublishableKey';
import {
  ZerospinApisUrl as ZerospinApisUrlService,
  type ZerospinApisUrl,
} from '@zerospin/core/services/ZerospinApisUrl';
import { applyFrontendBlock } from '@zerospin/core/session/applyFrontendBlock';
import { applyFrontendLineageBlock } from '@zerospin/core/session/applyFrontendLineageBlock';
import { applyFrontendReplicaState } from '@zerospin/core/session/applyFrontendReplicaState';
import { applyFrontendState } from '@zerospin/core/session/applyFrontendState';
import {
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import type {
  IFrontendReplicaBlock,
  ISession,
  ISessionSchema,
  ISessionWaSqliteDb,
} from '@zerospin/core/session/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { createFrontendWebSocketTicket } from '@zerospin/frontend/createFrontendWebSocketTicket';
import { fetchFrontend } from '@zerospin/frontend/fetchFrontend';
import { fetchFrontendState } from '@zerospin/frontend/fetchFrontendState';
import { pushFrontendCommands } from '@zerospin/frontend/pushFrontendCommands';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Either, Redacted, Runtime, Schema } from 'effect';

import { acquireFrontendWebSocket } from './acquireFrontendWebSocket';
import type { IBrowserPartitionController } from './makeBrowserPartitionController';
import { eq } from 'drizzle-orm';

/*
 * 1. Authenticate online through the Config-owned current signature generator.
 * 2. Compare the complete authenticated frontend spec with compiled code.
 * 3. On transport failure only, acquire an exact cached ready worker replica.
 * 4. Hydrate one fresh main-thread database before joining callback fan-out.
 * 5. In worker mode, apply only worker replica states/blocks to that database.
 * 6. In direct mode, own full-state repair, resume/replay socket, and push locally.
 * 7. Release only this Provider registration/socket; Config owns worker roots.
 */
export const bootstrapBrowserSession = Effect.fn('bootstrapBrowserSession')(
  function* <FRONTEND extends IFrontendController>(props: {
    session: ISession<FRONTEND>;
    browserPartitionController: IBrowserPartitionController;
  }): Effect.fn.Return<
    {
      db: ISessionWaSqliteDb<
        InferFrontendModels<FRONTEND>,
        IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
      >;
      schema: ISessionSchema<InferFrontendModels<FRONTEND>>;
      models: InferFrontendModels<FRONTEND>;
      actor: IActor;
      releaseBrowserSession: Effect.Effect<void>;
    },
    IAnyError,
    Async | CuidFactory | PublishableKey | TelemetryCollector | ZerospinApisUrl
  > {
    const { browserPartitionController, session } = props;
    const frontend = session.frontend;
    const apiUrl = yield* ZerospinApisUrlService;
    const publishableKey = yield* PublishableKeyService;
    const publishableKeyValue = Redacted.value(publishableKey);
    const runtime = yield* Effect.runtime<
      | Async
      | CuidFactory
      | PublishableKey
      | TelemetryCollector
      | ZerospinApisUrl
    >();
    const compiledFrontendSpec = makeFrontendControllerSpec(frontend);
    const compiledFrontendSpecHash =
      yield* makeFrontendSpecHash(compiledFrontendSpec);

    const admitted = yield* fetchFrontend({
      frontend,
      generateSignature: () =>
        browserPartitionController
          .getAccountGenerateSignature(frontend)()
          .pipe(
            Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
            Effect.mapError(error =>
              ZerospinError.isZerospinError(error)
                ? error
                : new ZerospinError({
                    code: 'frontend-signature-invalid',
                    message:
                      'Configured account frontend signature does not match its controller schema',
                    cause: ZerospinError.prettyUnknownFailure(error),
                  }),
            ),
          ),
    }).pipe(Effect.either);

    if (Either.isLeft(admitted)) {
      const isTransportFailure =
        admitted.left.code === 'frontend-admission-transport-failed' ||
        admitted.left.code === 'async-failed' ||
        admitted.left.cause?.includes('fetch failed') === true ||
        admitted.left.cause?.includes('ECONNREFUSED') === true ||
        admitted.left.cause?.includes('NetworkError') === true;
      const isSameTargetVersionMismatch =
        admitted.left.code === 'frontend-admission-target-mismatch' &&
        admitted.left.extra !== null &&
        admitted.left.extra.expectedAccountName ===
          admitted.left.extra.accountName &&
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
        (admitted.left.code === 'frontend-admission-target-mismatch' &&
          !isSameTargetVersionMismatch);
      if (isAuthorityRejection) {
        yield* browserPartitionController.invalidateCachedAccountFrontendLocators(
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
        browserPartitionController.getCachedAccountFrontendLocator({
          apiUrl,
          publishableKey: publishableKeyValue,
          frontend,
          role: 'active',
        });
      if (cachedLocator === null) {
        return yield* admitted.left;
      }

      session.store.setState({
        workerState: {
          mode: 'shared-worker',
          status: 'hydrating',
          bootstrapSource: null,
          frontendIndex: null,
          replicaIndex: null,
          databaseName: null,
          failure: null,
        },
      });
      const models = getFrontendDbModels(frontend);
      const dbConfig = makeResourceDbConfig({
        models,
        otherTables: sessionRepoTables,
      });
      const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
      let isDatabaseClosed = false;
      let currentFrontendIndex = 0;
      let currentReplicaIndex = 0;
      let previousReplicaBlock: IFrontendReplicaBlock | null = null;
      let isWorkerUpdateRequired = false;
      let isWorkerOnline = false;
      let currentAccountId = cachedLocator.accountId;
      let currentActorId = cachedLocator.actorId;
      let currentSystemId = cachedLocator.systemId;
      let currentGenerationId = cachedLocator.generationId;
      let currentSystemVersion = cachedLocator.systemVersion;
      let currentSystemWorkerName = cachedLocator.systemWorkerName;

      const acquisition = yield* browserPartitionController
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl,
          publishableKey: publishableKeyValue,
          systemId: cachedLocator.systemId,
          generationId: cachedLocator.generationId,
          systemVersion: cachedLocator.systemVersion,
          accountId: cachedLocator.accountId,
          accountName: cachedLocator.accountName,
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
              fetchFrontend({
                frontend,
                generateSignature: () =>
                  browserPartitionController
                    .getAccountGenerateSignature(frontend)()
                    .pipe(
                      Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                      Effect.mapError(error =>
                        ZerospinError.isZerospinError(error)
                          ? error
                          : new ZerospinError({
                              code: 'frontend-signature-invalid',
                              message:
                                'Configured account frontend signature does not match its controller schema after transport returned',
                              cause: ZerospinError.prettyUnknownFailure(error),
                            }),
                      ),
                    ),
              }).pipe(Effect.either),
            );
            if (Either.isLeft(regained)) {
              const isRegainTransportFailure =
                regained.left.code === 'frontend-admission-transport-failed' ||
                regained.left.code === 'async-failed' ||
                regained.left.cause?.includes('fetch failed') === true ||
                regained.left.cause?.includes('ECONNREFUSED') === true ||
                regained.left.cause?.includes('NetworkError') === true;
              if (isRegainTransportFailure) {
                return;
              }
              if (
                regained.left.code === 'frontend-admission-target-mismatch' &&
                regained.left.extra !== null &&
                regained.left.extra.expectedAccountName ===
                  regained.left.extra.accountName &&
                regained.left.extra.expectedActorName ===
                  regained.left.extra.actorName &&
                regained.left.extra.expectedFrontendName ===
                  regained.left.extra.frontendName &&
                regained.left.extra.expectedFrontendVersion !==
                  regained.left.extra.frontendVersion
              ) {
                // A server-side version promotion for the same authored
                // account target requires matching client code. It does not
                // revoke the cached principal or its durable journal.
                return 'update-required';
              }
              const isAuthorityRejection =
                String(regained.left.code).includes('signature-invalid') ||
                String(regained.left.code).includes('authentication') ||
                String(regained.left.code).includes('authorization') ||
                String(regained.left.code).includes('authenticate') ||
                String(regained.left.code).includes('authorize') ||
                String(regained.left.code).includes('authenticator') ||
                regained.left.code === 'frontend-admission-target-mismatch';
              if (!isAuthorityRejection) {
                return;
              }
              await Runtime.runPromise(runtime)(
                browserPartitionController.invalidateCachedAccountFrontendLocators(
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

            const releaseRegainedFrontendApi =
              regained.right.releaseFrontendApi;
            if (
              regained.right.identity.systemId !== cachedLocator.systemId ||
              regained.right.identity.accountId !== cachedLocator.accountId ||
              regained.right.identity.accountName !==
                cachedLocator.accountName ||
              regained.right.identity.actorId !== cachedLocator.actorId ||
              regained.right.identity.actorName !== cachedLocator.actorName ||
              regained.right.identity.frontendName !==
                cachedLocator.frontendName
            ) {
              releaseRegainedFrontendApi();
              await Runtime.runPromise(runtime)(
                browserPartitionController.invalidateCachedAccountFrontendLocators(
                  {
                    apiUrl,
                    publishableKey: publishableKeyValue,
                    error: new ZerospinError({
                      code: 'frontend-offline-regain-target-mismatch',
                      message:
                        'Reauthenticated account frontend does not match the cached offline replica',
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
              // revocation. Keep the source locator, replica, and journal so a
              // matching compiled controller can resume the transition later.
              return 'update-required';
            }

            releaseRegainedFrontendApi();
            const upgraded = await Runtime.runPromise(runtime)(
              browserPartitionController
                .acquireAccountFrontendReplica({
                  frontend,
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  systemId: regained.right.identity.systemId,
                  generationId: regained.right.identity.generationId,
                  systemVersion: regained.right.identity.systemVersion,
                  accountId: regained.right.identity.accountId,
                  accountName: regained.right.identity.accountName,
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
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend state authentication resolved another target',
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
                                      'Fresh account frontend state authentication resolved another compiled version',
                                  });
                                }
                                if (
                                  currentFrontend.identity.generationId !==
                                  regained.right.identity.generationId
                                ) {
                                  return yield* new ZerospinError({
                                    code: 'frontend-generation-changed',
                                    message:
                                      'Fresh account frontend state authentication resolved a successor generation',
                                  });
                                }
                                return yield* fetchFrontendState({
                                  frontendApi: currentFrontend.frontendApi,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend ticket authentication resolved another target',
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
                                      'Fresh account frontend ticket authentication resolved another compiled version',
                                  });
                                }
                                return yield* createFrontendWebSocketTicket({
                                  frontendApi: currentFrontend.frontendApi,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                    pushCommands: commands =>
                      Runtime.runPromise(runtime)(
                        encodeRpc(
                          Effect.acquireUseRelease(
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend push authentication resolved another target',
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
                                      'Fresh account frontend push authentication resolved another compiled version',
                                  });
                                }
                                if (
                                  currentFrontend.identity.generationId !==
                                  regained.right.identity.generationId
                                ) {
                                  return yield* new ZerospinError({
                                    code: 'frontend-generation-changed',
                                    message:
                                      'Fresh account frontend push authentication resolved a successor generation',
                                  });
                                }
                                return yield* pushFrontendCommands({
                                  frontendApi: currentFrontend.frontendApi,
                                  commands,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
              // source locator and durable journal for a later authority retry.
              // The controller either retained the target capability or
              // released it before returning this failure.
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
                code: 'account-frontend-session-database-close-failed',
                message:
                  'Failed to close the cached account frontend Provider database after acquisition failure',
              }),
            }).pipe(Effect.ignore),
          ),
        );
      const hydrated = yield* acquisition.hydrateSession({
        sessionId: session.sessionId,
        replaceFrontendState: async frontendReplicaState => {
          await Runtime.runPromise(runtime)(
            applyFrontendReplicaState({
              frontend,
              accountId: frontendReplicaState.accountId,
              actorId: frontendReplicaState.actorId,
              systemId: frontendReplicaState.systemId,
              generationId: frontendReplicaState.generationId,
              systemVersion: frontendReplicaState.systemVersion,
              systemWorkerName: frontendReplicaState.systemWorkerName,
              db,
              schema: dbConfig.schema,
              models,
              frontendReplicaState,
            }),
          );
          currentFrontendIndex = frontendReplicaState.frontendIndex;
          currentReplicaIndex = frontendReplicaState.replicaIndex;
          previousReplicaBlock = null;
          currentAccountId = frontendReplicaState.accountId;
          currentActorId = frontendReplicaState.actorId;
          currentSystemId = frontendReplicaState.systemId;
          currentGenerationId = frontendReplicaState.generationId;
          currentSystemVersion = frontendReplicaState.systemVersion;
          currentSystemWorkerName = frontendReplicaState.systemWorkerName;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              accountId: frontendReplicaState.accountId,
              accountName: frontendReplicaState.accountName,
              actorId: frontendReplicaState.actorId,
              systemId: frontendReplicaState.systemId,
              generationId: frontendReplicaState.generationId,
              systemVersion: frontendReplicaState.systemVersion,
              systemWorkerName: frontendReplicaState.systemWorkerName,
              frontendName: frontendReplicaState.frontendName,
              frontendVersion: frontendReplicaState.frontendVersion,
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
              lastRebasedPushedCursor:
                frontendReplicaState.lastRebasedPushedCursor,
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
        handleFrontendReplicaBlock: async frontendReplicaBlock => {
          const outcome = await Runtime.runPromise(runtime)(
            applyFrontendBlock({
              frontend,
              accountId: currentAccountId,
              actorId: currentActorId,
              systemId: currentSystemId,
              generationId: currentGenerationId,
              systemVersion: currentSystemVersion,
              systemWorkerName: currentSystemWorkerName,
              db,
              models,
              frontendReplicaBlock,
              currentFrontendIndex,
              currentReplicaIndex,
              previousReplicaBlock,
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
              lastRebasedPushedCursor:
                frontendReplicaBlock.kind === 'server' &&
                frontendReplicaBlock.lineageBlock.kind === 'frontend'
                  ? frontendReplicaBlock.lineageBlock.frontendBlock
                      .lastRebasedPushedCursor
                  : state.lastRebasedPushedCursor,
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
                status: isWorkerUpdateRequired
                  ? 'update-required'
                  : 'repairing',
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
                status: isWorkerUpdateRequired
                  ? 'update-required'
                  : 'repairing',
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
        },
        setFailure: error => {
          const failure: IAnyErrorJson = Schema.encodeSync(
            ZerospinError.schema,
          )(
            ZerospinError.isZerospinError(error)
              ? error
              : ZerospinError.catch({
                  code: 'frontend-session-repair-failed',
                  message: 'Account frontend main-thread repair failed',
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
            accountId: null,
            accountName: null,
            actorId: null,
            systemId: null,
            generationId: null,
            systemVersion: null,
            systemWorkerName: null,
            frontendName: null,
            frontendVersion: null,
            db: null,
            schema: null,
            models: null,
            vfsName: null,
            isInitialized: false,
            frontendIndex: null,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
            isPushPaused: state.isPushPaused,
            isSharedWorkerEnabled: state.isSharedWorkerEnabled,
            workerState: {
              mode: 'shared-worker',
              status: error === null ? 'released' : 'failed',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure,
            },
            lastDevtoolsPush: state.lastDevtoolsPush,
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

      const frontendReplicaState = hydrated.frontendReplicaState;
      session.store.setState({
        sessionId: session.sessionId,
        accountId: frontendReplicaState.accountId,
        accountName: frontendReplicaState.accountName,
        actorId: frontendReplicaState.actorId,
        systemId: frontendReplicaState.systemId,
        generationId: frontendReplicaState.generationId,
        systemVersion: frontendReplicaState.systemVersion,
        systemWorkerName: frontendReplicaState.systemWorkerName,
        frontendName: frontendReplicaState.frontendName,
        frontendVersion: frontendReplicaState.frontendVersion,
        db,
        schema: dbConfig.schema,
        models,
        vfsName: null,
        isInitialized: true,
        frontendIndex: frontendReplicaState.frontendIndex,
        replicaIndex: frontendReplicaState.replicaIndex,
        lastRebasedPushedCursor: frontendReplicaState.lastRebasedPushedCursor,
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
        db,
        schema: dbConfig.schema,
        models,
        actor: {
          accountId: frontendReplicaState.accountId,
          actorId: frontendReplicaState.actorId,
        },
        releaseBrowserSession: hydrated.release,
      };
    }

    const releaseFrontendApi = Effect.sync(admitted.right.releaseFrontendApi);
    const admittedFrontendSpecHash = yield* makeFrontendSpecHash(
      admitted.right.frontendSpec,
    ).pipe(Effect.tapError(() => releaseFrontendApi));
    if (admittedFrontendSpecHash !== compiledFrontendSpecHash) {
      const compiledSpecMismatch = new ZerospinError({
        code: 'frontend-compiled-spec-mismatch',
        message:
          'Authenticated account frontend spec does not match the compiled controller',
      });
      if (browserPartitionController.isSharedWorkerEnabled) {
        yield* browserPartitionController.invalidateCachedAccountFrontendLocators(
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
    const models = getFrontendDbModels(frontend);
    const dbConfig = makeResourceDbConfig({
      models,
      otherTables: sessionRepoTables,
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
    let previousReplicaBlock: IFrontendReplicaBlock | null = null;
    let isWorkerUpdateRequired = false;
    let currentAccountId = identity.accountId;
    let currentActorId = identity.actorId;
    let currentSystemId = identity.systemId;
    let currentGenerationId = identity.generationId;
    let currentSystemVersion = identity.systemVersion;
    let currentSystemWorkerName = identity.systemWorkerName;

    if (browserPartitionController.isSharedWorkerEnabled) {
      session.store.setState({
        workerState: {
          mode: 'shared-worker',
          status: 'hydrating',
          bootstrapSource: null,
          frontendIndex: null,
          replicaIndex: null,
          databaseName: null,
          failure: null,
        },
      });
      const acquisition = yield* browserPartitionController
        .acquireAccountFrontendReplica({
          frontend,
          apiUrl,
          publishableKey: publishableKeyValue,
          systemId: identity.systemId,
          generationId: identity.generationId,
          systemVersion: identity.systemVersion,
          accountId: identity.accountId,
          accountName: identity.accountName,
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
                    fetchFrontend({
                      frontend,
                      generateSignature: () =>
                        browserPartitionController
                          .getAccountGenerateSignature(frontend)()
                          .pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code: 'frontend-signature-invalid',
                                    message:
                                      'Configured account frontend state signature does not match its controller schema',
                                    cause:
                                      ZerospinError.prettyUnknownFailure(error),
                                  }),
                            ),
                          ),
                    }).pipe(
                      Effect.mapError(error =>
                        error.code === 'frontend-admission-target-mismatch' &&
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
                                'The authenticated account frontend now requires a different compiled version',
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
                          currentFrontend.identity.accountId !==
                            identity.accountId ||
                          currentFrontend.identity.accountName !==
                            identity.accountName ||
                          currentFrontend.identity.actorId !==
                            identity.actorId ||
                          currentFrontend.identity.actorName !==
                            identity.actorName ||
                          currentFrontend.identity.frontendName !==
                            identity.frontendName
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-authentication-target-changed',
                            message:
                              'Fresh account frontend state authentication resolved another target',
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
                              'Fresh account frontend state authentication resolved another compiled version',
                          });
                        }
                        if (
                          currentFrontend.identity.generationId !==
                          identity.generationId
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-generation-changed',
                            message:
                              'Fresh account frontend state authentication resolved a successor generation',
                            extra: {
                              generationId: identity.generationId,
                              successorGenerationId:
                                currentFrontend.identity.generationId,
                            },
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
                      const isTransportFailure =
                        error.code === 'frontend-admission-transport-failed' ||
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
                        error.code === 'frontend-admission-target-mismatch';
                      return isTransportFailure ||
                        error.code === 'frontend-version-changed' ||
                        error.code === 'frontend-generation-changed' ||
                        !isAuthorityRejection
                        ? Effect.void
                        : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                    fetchFrontend({
                      frontend,
                      generateSignature: () =>
                        browserPartitionController
                          .getAccountGenerateSignature(frontend)()
                          .pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code: 'frontend-signature-invalid',
                                    message:
                                      'Configured account frontend ticket signature does not match its controller schema',
                                    cause:
                                      ZerospinError.prettyUnknownFailure(error),
                                  }),
                            ),
                          ),
                    }).pipe(
                      Effect.mapError(error =>
                        error.code === 'frontend-admission-target-mismatch' &&
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
                                'The authenticated account frontend now requires a different compiled version',
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
                          currentFrontend.identity.accountId !==
                            identity.accountId ||
                          currentFrontend.identity.accountName !==
                            identity.accountName ||
                          currentFrontend.identity.actorId !==
                            identity.actorId ||
                          currentFrontend.identity.actorName !==
                            identity.actorName ||
                          currentFrontend.identity.frontendName !==
                            identity.frontendName
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-authentication-target-changed',
                            message:
                              'Fresh account frontend ticket authentication resolved another target',
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
                              'Fresh account frontend ticket authentication resolved another compiled version',
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
                      const isTransportFailure =
                        error.code === 'frontend-admission-transport-failed' ||
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
                        error.code === 'frontend-admission-target-mismatch';
                      return isTransportFailure ||
                        error.code === 'frontend-version-changed' ||
                        error.code === 'frontend-generation-changed' ||
                        !isAuthorityRejection
                        ? Effect.void
                        : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
            pushCommands: commands =>
              Runtime.runPromise(runtime)(
                encodeRpc(
                  Effect.acquireUseRelease(
                    fetchFrontend({
                      frontend,
                      generateSignature: () =>
                        browserPartitionController
                          .getAccountGenerateSignature(frontend)()
                          .pipe(
                            Effect.flatMap(
                              Schema.decodeUnknown(frontend.signature),
                            ),
                            Effect.mapError(error =>
                              ZerospinError.isZerospinError(error)
                                ? error
                                : new ZerospinError({
                                    code: 'frontend-signature-invalid',
                                    message:
                                      'Configured account frontend push signature does not match its controller schema',
                                    cause:
                                      ZerospinError.prettyUnknownFailure(error),
                                  }),
                            ),
                          ),
                    }).pipe(
                      Effect.mapError(error =>
                        error.code === 'frontend-admission-target-mismatch' &&
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
                                'The authenticated account frontend now requires a different compiled version',
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
                          currentFrontend.identity.accountId !==
                            identity.accountId ||
                          currentFrontend.identity.accountName !==
                            identity.accountName ||
                          currentFrontend.identity.actorId !==
                            identity.actorId ||
                          currentFrontend.identity.actorName !==
                            identity.actorName ||
                          currentFrontend.identity.frontendName !==
                            identity.frontendName
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-authentication-target-changed',
                            message:
                              'Fresh account frontend push authentication resolved another target',
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
                              'Fresh account frontend push authentication resolved another compiled version',
                          });
                        }
                        if (
                          currentFrontend.identity.generationId !==
                          identity.generationId
                        ) {
                          return yield* new ZerospinError({
                            code: 'frontend-generation-changed',
                            message:
                              'Fresh account frontend push authentication resolved a successor generation',
                            extra: {
                              generationId: identity.generationId,
                              successorGenerationId:
                                currentFrontend.identity.generationId,
                            },
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
                      const isTransportFailure =
                        error.code === 'frontend-admission-transport-failed' ||
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
                        error.code === 'frontend-admission-target-mismatch';
                      return isTransportFailure ||
                        error.code === 'frontend-version-changed' ||
                        error.code === 'frontend-generation-changed' ||
                        !isAuthorityRejection
                        ? Effect.void
                        : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
              fetchFrontend({
                frontend,
                generateSignature: () =>
                  browserPartitionController
                    .getAccountGenerateSignature(frontend)()
                    .pipe(
                      Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                      Effect.mapError(error =>
                        ZerospinError.isZerospinError(error)
                          ? error
                          : new ZerospinError({
                              code: 'frontend-signature-invalid',
                              message:
                                'Configured account frontend signature does not match its controller schema after online transport returned',
                              cause: ZerospinError.prettyUnknownFailure(error),
                            }),
                      ),
                    ),
              }).pipe(Effect.either),
            );
            if (Either.isLeft(regained)) {
              const isRegainTransportFailure =
                regained.left.code === 'frontend-admission-transport-failed' ||
                regained.left.code === 'async-failed' ||
                regained.left.cause?.includes('fetch failed') === true ||
                regained.left.cause?.includes('ECONNREFUSED') === true ||
                regained.left.cause?.includes('NetworkError') === true;
              if (isRegainTransportFailure) {
                return;
              }
              if (
                regained.left.code === 'frontend-admission-target-mismatch' &&
                regained.left.extra !== null &&
                regained.left.extra.expectedAccountName ===
                  regained.left.extra.accountName &&
                regained.left.extra.expectedActorName ===
                  regained.left.extra.actorName &&
                regained.left.extra.expectedFrontendName ===
                  regained.left.extra.frontendName &&
                regained.left.extra.expectedFrontendVersion !==
                  regained.left.extra.frontendVersion
              ) {
                // The same authored account target now requires another
                // compiled frontend version. Preserve the live replica and
                // durable journal while every Provider enters update-required.
                return 'update-required';
              }
              const isAuthorityRejection =
                String(regained.left.code).includes('signature-invalid') ||
                String(regained.left.code).includes('authentication') ||
                String(regained.left.code).includes('authorization') ||
                String(regained.left.code).includes('authenticate') ||
                String(regained.left.code).includes('authorize') ||
                String(regained.left.code).includes('authenticator') ||
                regained.left.code === 'frontend-admission-target-mismatch';
              if (!isAuthorityRejection) {
                return;
              }
              await Runtime.runPromise(runtime)(
                browserPartitionController.invalidateCachedAccountFrontendLocators(
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

            const releaseRegainedFrontendApi =
              regained.right.releaseFrontendApi;
            if (
              regained.right.identity.systemId !== identity.systemId ||
              regained.right.identity.accountId !== identity.accountId ||
              regained.right.identity.accountName !== identity.accountName ||
              regained.right.identity.actorId !== identity.actorId ||
              regained.right.identity.actorName !== identity.actorName ||
              regained.right.identity.frontendName !== identity.frontendName
            ) {
              releaseRegainedFrontendApi();
              await Runtime.runPromise(runtime)(
                browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                .acquireAccountFrontendReplica({
                  frontend,
                  apiUrl,
                  publishableKey: publishableKeyValue,
                  systemId: regained.right.identity.systemId,
                  generationId: regained.right.identity.generationId,
                  systemVersion: regained.right.identity.systemVersion,
                  accountId: regained.right.identity.accountId,
                  accountName: regained.right.identity.accountName,
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
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend state authentication resolved another target',
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
                                      'Fresh account frontend state authentication resolved another compiled version',
                                  });
                                }
                                if (
                                  currentFrontend.identity.generationId !==
                                  regained.right.identity.generationId
                                ) {
                                  return yield* new ZerospinError({
                                    code: 'frontend-generation-changed',
                                    message:
                                      'Fresh account frontend state authentication resolved a successor generation',
                                  });
                                }
                                return yield* fetchFrontendState({
                                  frontendApi: currentFrontend.frontendApi,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend ticket authentication resolved another target',
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
                                      'Fresh account frontend ticket authentication resolved another compiled version',
                                  });
                                }
                                return yield* createFrontendWebSocketTicket({
                                  frontendApi: currentFrontend.frontendApi,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
                    pushCommands: commands =>
                      Runtime.runPromise(runtime)(
                        encodeRpc(
                          Effect.acquireUseRelease(
                            fetchFrontend({
                              frontend,
                              generateSignature: () =>
                                browserPartitionController
                                  .getAccountGenerateSignature(frontend)()
                                  .pipe(
                                    Effect.flatMap(
                                      Schema.decodeUnknown(frontend.signature),
                                    ),
                                    Effect.mapError(error =>
                                      ZerospinError.isZerospinError(error)
                                        ? error
                                        : new ZerospinError({
                                            code:
                                              'frontend-signature-invalid',
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
                                        'The authenticated account frontend now requires a different compiled version',
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
                                  currentFrontend.identity.accountId !==
                                    regained.right.identity.accountId ||
                                  currentFrontend.identity.accountName !==
                                    regained.right.identity.accountName ||
                                  currentFrontend.identity.actorId !==
                                    regained.right.identity.actorId ||
                                  currentFrontend.identity.actorName !==
                                    regained.right.identity.actorName ||
                                  currentFrontend.identity.frontendName !==
                                    regained.right.identity.frontendName
                                ) {
                                  return yield* new ZerospinError({
                                    code:
                                      'frontend-authentication-target-changed',
                                    message:
                                      'Fresh account frontend push authentication resolved another target',
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
                                      'Fresh account frontend push authentication resolved another compiled version',
                                  });
                                }
                                if (
                                  currentFrontend.identity.generationId !==
                                  regained.right.identity.generationId
                                ) {
                                  return yield* new ZerospinError({
                                    code: 'frontend-generation-changed',
                                    message:
                                      'Fresh account frontend push authentication resolved a successor generation',
                                  });
                                }
                                return yield* pushFrontendCommands({
                                  frontendApi: currentFrontend.frontendApi,
                                  commands,
                                });
                              }),
                            currentFrontend =>
                              Effect.sync(
                                currentFrontend.releaseFrontendApi,
                              ),
                          ).pipe(
                            Effect.tapError(error => {
                              const isTransportFailure =
                                error.code ===
                                  'frontend-admission-transport-failed' ||
                                error.code === 'async-failed' ||
                                error.cause?.includes('fetch failed') === true ||
                                error.cause?.includes('ECONNREFUSED') === true ||
                                error.cause?.includes('NetworkError') === true;
                              const isAuthorityRejection =
                                String(error.code).includes(
                                  'signature-invalid',
                                ) ||
                                String(error.code).includes(
                                  'authentication',
                                ) ||
                                String(error.code).includes(
                                  'authorization',
                                ) ||
                                String(error.code).includes('authenticate') ||
                                String(error.code).includes('authorize') ||
                                String(error.code).includes('authenticator') ||
                                error.code ===
                                  'frontend-admission-target-mismatch';
                              return isTransportFailure ||
                                error.code === 'frontend-version-changed' ||
                                error.code === 'frontend-generation-changed' ||
                                !isAuthorityRejection
                                ? Effect.void
                                : browserPartitionController.invalidateCachedAccountFrontendLocators(
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
              // source locator and durable journal for a later authority retry.
              // The controller either retained the target capability or
              // released it before returning this failure.
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
                code: 'account-frontend-session-database-close-failed',
                message:
                  'Failed to close the online account frontend Provider database after acquisition failure',
              }),
            }).pipe(Effect.ignore),
          ),
        );
      const hydrated = yield* acquisition.hydrateSession({
        sessionId: session.sessionId,
        replaceFrontendState: async frontendReplicaState => {
          await Runtime.runPromise(runtime)(
            applyFrontendReplicaState({
              frontend,
              accountId: frontendReplicaState.accountId,
              actorId: frontendReplicaState.actorId,
              systemId: frontendReplicaState.systemId,
              generationId: frontendReplicaState.generationId,
              systemVersion: frontendReplicaState.systemVersion,
              systemWorkerName: frontendReplicaState.systemWorkerName,
              db,
              schema: dbConfig.schema,
              models,
              frontendReplicaState,
            }),
          );
          currentFrontendIndex = frontendReplicaState.frontendIndex;
          currentReplicaIndex = frontendReplicaState.replicaIndex;
          previousReplicaBlock = null;
          currentAccountId = frontendReplicaState.accountId;
          currentActorId = frontendReplicaState.actorId;
          currentSystemId = frontendReplicaState.systemId;
          currentGenerationId = frontendReplicaState.generationId;
          currentSystemVersion = frontendReplicaState.systemVersion;
          currentSystemWorkerName = frontendReplicaState.systemWorkerName;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              accountId: frontendReplicaState.accountId,
              accountName: frontendReplicaState.accountName,
              actorId: frontendReplicaState.actorId,
              systemId: frontendReplicaState.systemId,
              generationId: frontendReplicaState.generationId,
              systemVersion: frontendReplicaState.systemVersion,
              systemWorkerName: frontendReplicaState.systemWorkerName,
              frontendName: frontendReplicaState.frontendName,
              frontendVersion: frontendReplicaState.frontendVersion,
              frontendIndex: currentFrontendIndex,
              replicaIndex: currentReplicaIndex,
              lastRebasedPushedCursor:
                frontendReplicaState.lastRebasedPushedCursor,
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
        handleFrontendReplicaBlock: async frontendReplicaBlock => {
          const outcome = await Runtime.runPromise(runtime)(
            applyFrontendBlock({
              frontend,
              accountId: currentAccountId,
              actorId: currentActorId,
              systemId: currentSystemId,
              generationId: currentGenerationId,
              systemVersion: currentSystemVersion,
              systemWorkerName: currentSystemWorkerName,
              db,
              models,
              frontendReplicaBlock,
              currentFrontendIndex,
              currentReplicaIndex,
              previousReplicaBlock,
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
              lastRebasedPushedCursor:
                frontendReplicaBlock.kind === 'server' &&
                frontendReplicaBlock.lineageBlock.kind === 'frontend'
                  ? frontendReplicaBlock.lineageBlock.frontendBlock
                      .lastRebasedPushedCursor
                  : state.lastRebasedPushedCursor,
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
                status: isWorkerUpdateRequired
                  ? 'update-required'
                  : 'repairing',
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
                status: isWorkerUpdateRequired
                  ? 'update-required'
                  : 'repairing',
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
        },
        setFailure: error => {
          const failure: IAnyErrorJson = Schema.encodeSync(
            ZerospinError.schema,
          )(
            ZerospinError.isZerospinError(error)
              ? error
              : ZerospinError.catch({
                  code: 'frontend-session-repair-failed',
                  message: 'Account frontend main-thread repair failed',
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
            accountId: null,
            accountName: null,
            actorId: null,
            systemId: null,
            generationId: null,
            systemVersion: null,
            systemWorkerName: null,
            frontendName: null,
            frontendVersion: null,
            db: null,
            schema: null,
            models: null,
            vfsName: null,
            isInitialized: false,
            frontendIndex: null,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
            isPushPaused: state.isPushPaused,
            isSharedWorkerEnabled: state.isSharedWorkerEnabled,
            workerState: {
              mode: 'shared-worker',
              status: error === null ? 'released' : 'failed',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure,
            },
            lastDevtoolsPush: state.lastDevtoolsPush,
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

      const frontendReplicaState = hydrated.frontendReplicaState;
      session.store.setState({
        sessionId: session.sessionId,
        accountId: frontendReplicaState.accountId,
        accountName: frontendReplicaState.accountName,
        actorId: frontendReplicaState.actorId,
        systemId: frontendReplicaState.systemId,
        generationId: frontendReplicaState.generationId,
        systemVersion: frontendReplicaState.systemVersion,
        systemWorkerName: frontendReplicaState.systemWorkerName,
        frontendName: frontendReplicaState.frontendName,
        frontendVersion: frontendReplicaState.frontendVersion,
        db,
        schema: dbConfig.schema,
        models,
        vfsName: null,
        isInitialized: true,
        frontendIndex: frontendReplicaState.frontendIndex,
        replicaIndex: frontendReplicaState.replicaIndex,
        lastRebasedPushedCursor: frontendReplicaState.lastRebasedPushedCursor,
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
        db,
        schema: dbConfig.schema,
        models,
        actor: identity.actor,
        releaseBrowserSession: hydrated.release,
      };
    }

    session.store.setState({
      workerState: {
        mode: 'direct',
        status: 'hydrating',
        bootstrapSource: null,
        frontendIndex: null,
        replicaIndex: null,
        databaseName: null,
        failure: null,
      },
    });
    const frontendState = yield* fetchFrontendState({
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
                code: 'account-frontend-session-database-close-failed',
                message:
                  'Failed to close the direct account frontend Provider database after state fetch failure',
              }),
            }).pipe(Effect.ignore),
          ),
        ),
      ),
    );
    let currentDirectIdentity = identity;
    let currentDirectLastRebasedPushedCursor =
      frontendState.lastRebasedPushedCursor;
    let currentDirectStatus:
      | 'connecting'
      | 'replaying'
      | 'online'
      | 'repairing'
      | 'update-required'
      | 'failed' = 'connecting';
    yield* applyFrontendState({
      frontend,
      frontendVersion: currentDirectIdentity.frontendVersion,
      accountId: currentDirectIdentity.accountId,
      actorId: currentDirectIdentity.actorId,
      systemId: currentDirectIdentity.systemId,
      generationId: currentDirectIdentity.generationId,
      systemVersion: currentDirectIdentity.systemVersion,
      systemWorkerName: currentDirectIdentity.systemWorkerName,
      db,
      schema: dbConfig.schema,
      models,
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
                code: 'account-frontend-session-database-close-failed',
                message:
                  'Failed to close the direct account frontend Provider database after state application failure',
              }),
            }).pipe(Effect.ignore),
          ),
        ),
      ),
    );
    currentFrontendIndex = frontendState.frontendIndex;

    const releaseFrontendWebSocket = yield* acquireFrontendWebSocket({
      frontend,
      frontendApi: admitted.right.frontendApi,
      releaseFrontendApi: admitted.right.releaseFrontendApi,
      identity: currentDirectIdentity,
      getFrontendIndex: () => currentFrontendIndex,
      replaceFrontendState: frontendReplacement =>
        applyFrontendState({
          frontend,
          frontendVersion: currentDirectIdentity.frontendVersion,
          accountId: currentDirectIdentity.accountId,
          actorId: currentDirectIdentity.actorId,
          systemId: currentDirectIdentity.systemId,
          generationId: currentDirectIdentity.generationId,
          systemVersion: currentDirectIdentity.systemVersion,
          systemWorkerName: currentDirectIdentity.systemWorkerName,
          db,
          schema: dbConfig.schema,
          models,
          frontendState: frontendReplacement,
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              currentDirectLastRebasedPushedCursor =
                frontendReplacement.lastRebasedPushedCursor;
              currentFrontendIndex = frontendReplacement.frontendIndex;
              session.store.setState({
                frontendIndex: currentFrontendIndex,
                lastRebasedPushedCursor:
                  frontendReplacement.lastRebasedPushedCursor,
              });
            }),
          ),
        ),
      handleFrontendLineageBlock: frontendLineageBlock =>
        applyFrontendLineageBlock({
          frontend,
          accountId: currentDirectIdentity.accountId,
          actorId: currentDirectIdentity.actorId,
          systemId: currentDirectIdentity.systemId,
          generationId: currentDirectIdentity.generationId,
          systemVersion: currentDirectIdentity.systemVersion,
          db,
          models,
          lineageBlock: frontendLineageBlock,
          currentFrontendIndex,
        }).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              currentFrontendIndex =
                frontendLineageBlock.kind === 'frontend'
                  ? frontendLineageBlock.frontendBlock.frontendIndex
                  : frontendLineageBlock.frontendIndex;
              if (frontendLineageBlock.kind === 'frontend') {
                currentDirectLastRebasedPushedCursor =
                  frontendLineageBlock.frontendBlock.lastRebasedPushedCursor;
              }
              const state = session.store.getState();
              if (state.isInitialized) {
                session.store.setState({
                  frontendIndex: currentFrontendIndex,
                  lastRebasedPushedCursor:
                    frontendLineageBlock.kind === 'frontend'
                      ? frontendLineageBlock.frontendBlock
                          .lastRebasedPushedCursor
                      : state.lastRebasedPushedCursor,
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
        ),
      regainFrontendApi: () =>
        Effect.gen(function* () {
          const regained = yield* fetchFrontend({
            frontend,
            generateSignature: () =>
              browserPartitionController
                .getAccountGenerateSignature(frontend)()
                .pipe(
                  Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                  Effect.mapError(error =>
                    ZerospinError.isZerospinError(error)
                      ? error
                      : new ZerospinError({
                          code: 'frontend-transport-regain-signature-invalid',
                          message:
                            'Configured account frontend transport-regain signature does not match its controller schema',
                          cause: ZerospinError.prettyUnknownFailure(error),
                        }),
                  ),
                ),
          }).pipe(Effect.either);
          if (Either.isLeft(regained)) {
            if (
              regained.left.code === 'frontend-admission-target-mismatch' &&
              regained.left.extra !== null &&
              regained.left.extra.expectedAccountName ===
                regained.left.extra.accountName &&
              regained.left.extra.expectedActorName ===
                regained.left.extra.actorName &&
              regained.left.extra.expectedFrontendName ===
                regained.left.extra.frontendName &&
              regained.left.extra.expectedFrontendVersion !==
                regained.left.extra.frontendVersion
            ) {
              // The mounted controller cannot safely consume state for the
              // new version. Preserve its current database and staged intent.
              return null;
            }
            return yield* regained.left;
          }

          const releaseRegainedFrontendApi = Effect.sync(
            regained.right.releaseFrontendApi,
          );
          if (
            regained.right.identity.systemId !==
              currentDirectIdentity.systemId ||
            regained.right.identity.accountId !==
              currentDirectIdentity.accountId ||
            regained.right.identity.accountName !==
              currentDirectIdentity.accountName ||
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
              code: 'frontend-transport-regain-authority-target-mismatch',
              message:
                'Reauthenticated account frontend transport does not match the readable direct replica target',
            });
          }

          const regainedFrontendSpecHash = yield* makeFrontendSpecHash(
            regained.right.frontendSpec,
          ).pipe(Effect.tapError(() => releaseRegainedFrontendApi));
          if (regainedFrontendSpecHash !== compiledFrontendSpecHash) {
            yield* releaseRegainedFrontendApi;
            return yield* new ZerospinError({
              code: 'frontend-transport-regain-compiled-spec-mismatch',
              message:
                'Reauthenticated account frontend transport spec does not match the readable direct replica controller',
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
          const targetAdmission = yield* fetchFrontend({
            frontend,
            generateSignature: () =>
              browserPartitionController
                .getAccountGenerateSignature(frontend)()
                .pipe(
                  Effect.flatMap(Schema.decodeUnknown(frontend.signature)),
                  Effect.mapError(error =>
                    ZerospinError.isZerospinError(error)
                      ? error
                      : new ZerospinError({
                          code: 'frontend-transition-signature-invalid',
                          message:
                            'Configured account frontend transition signature does not match its controller schema',
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
            targetAdmission.right.identity.generationId !==
              target.generationId ||
            targetAdmission.right.identity.accountId !== target.accountId ||
            targetAdmission.right.identity.accountName !== target.accountName ||
            targetAdmission.right.identity.actorId !== target.actorId ||
            targetAdmission.right.identity.actorName !== target.actorName ||
            targetAdmission.right.identity.frontendName !==
              target.frontendName ||
            targetAdmission.right.identity.frontendVersion !==
              target.frontendVersion
          ) {
            yield* releaseTargetFrontendApi;
            return yield* new ZerospinError({
              code: 'frontend-transition-authority-target-mismatch',
              message:
                'Reauthenticated account frontend authority does not match the requested transition target',
            });
          }

          const targetFrontendSpecHash = yield* makeFrontendSpecHash(
            targetAdmission.right.frontendSpec,
          ).pipe(Effect.tapError(() => releaseTargetFrontendApi));
          if (targetFrontendSpecHash !== compiledFrontendSpecHash) {
            yield* releaseTargetFrontendApi;
            return null;
          }

          const targetFrontendState = yield* fetchFrontendState({
            frontendApi: targetAdmission.right.frontendApi,
          }).pipe(Effect.tapError(() => releaseTargetFrontendApi));

          let isStagedCommandUpdateRequired = false;
          const stagedCommandPreparation = yield* Effect.gen(function* () {
            const stagedCommands = db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
              .all();
            const preparedStagedCommands = [];

            // 1 — validate and adapt every still-live command before replacing
            // authoritative state. A missing historical definition, invalid
            // payload, or incompatible current contract therefore leaves the
            // readable source generation and all staged intent untouched.
            for (const stagedCommand of stagedCommands) {
              const contract = frontend.contracts[stagedCommand.commandName];
              if (contract === undefined) {
                isStagedCommandUpdateRequired = true;
                return yield* new ZerospinError({
                  code: 'frontend-transition-staged-contract-missing',
                  message:
                    'Matching target code has no contract for a live direct command',
                  extra: {
                    commandId: stagedCommand.id,
                    commandName: stagedCommand.commandName,
                    sourceVersion: stagedCommand.version,
                  },
                });
              }

              let payloadInput: unknown;
              if (stagedCommand.version === contract.version) {
                payloadInput = yield* contract
                  .decodePayload({ command: stagedCommand })
                  .pipe(
                    Effect.tapError(() =>
                      Effect.sync(() => {
                        isStagedCommandUpdateRequired = true;
                      }),
                    ),
                  );
              } else {
                const historicalDefinition =
                  contract.historicalDefinitions.find(
                    definition =>
                      definition.commandName === stagedCommand.commandName &&
                      definition.version === stagedCommand.version,
                  );
                if (historicalDefinition === undefined) {
                  isStagedCommandUpdateRequired = true;
                  return yield* new ZerospinError({
                    code: 'frontend-transition-staged-adapter-missing',
                    message:
                      'Matching target code has no direct historical adapter for a live direct command',
                    extra: {
                      commandId: stagedCommand.id,
                      commandName: stagedCommand.commandName,
                      sourceVersion: stagedCommand.version,
                      targetVersion: contract.version,
                    },
                  });
                }
                const historicalPayload = yield* Schema.decode(
                  Schema.parseJson(
                    makeEffectSchema(historicalDefinition.payload),
                  ),
                )(stagedCommand.payload, {
                  onExcessProperty: 'error',
                }).pipe(
                  Effect.mapError(
                    error =>
                      new ZerospinError({
                        code:
                          'frontend-transition-staged-historical-payload-invalid',
                        message:
                          'Live direct command payload does not match its compiled historical definition',
                        cause: ZerospinError.prettyUnknownFailure(error),
                        extra: {
                          commandId: stagedCommand.id,
                          commandName: stagedCommand.commandName,
                          sourceVersion: stagedCommand.version,
                        },
                      }),
                  ),
                  Effect.tapError(() =>
                    Effect.sync(() => {
                      isStagedCommandUpdateRequired = true;
                    }),
                  ),
                );
                payloadInput = yield* historicalDefinition
                  .adaptPayload({ payload: historicalPayload })
                  .pipe(
                    Effect.tapError(() =>
                      Effect.sync(() => {
                        isStagedCommandUpdateRequired = true;
                      }),
                    ),
                  );
              }

              const currentCommand = {
                ...stagedCommand,
                systemVersion: targetAdmission.right.identity.systemVersion,
                version: contract.version,
                payload: payloadInput,
              };
              const current = yield* makeMutations({
                contract,
                models: frontend.models,
                owner: { kind: 'account' },
                command: currentCommand,
              }).pipe(
                Effect.tapError(() =>
                  Effect.sync(() => {
                    isStagedCommandUpdateRequired = true;
                  }),
                ),
              );
              const adaptedCommand = yield* encodeCommand({
                contract,
                command: {
                  ...currentCommand,
                  payload: current.payload,
                },
              }).pipe(
                Effect.tapError(() =>
                  Effect.sync(() => {
                    isStagedCommandUpdateRequired = true;
                  }),
                ),
              );

              const optimisticRow = db
                .select()
                .from(sessionOptimisticAppliedMutationDrizzleSchema)
                .where(
                  eq(
                    sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                    stagedCommand.id,
                  ),
                )
                .get();
              if (optimisticRow === undefined) {
                return yield* new ZerospinError({
                  code:
                    'frontend-transition-staged-optimistic-mutations-missing',
                  message:
                    'Live direct command has no optimistic mutation record during transition',
                  extra: { commandId: stagedCommand.id },
                });
              }
              yield* Schema.decode(
                Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
              )(optimisticRow.mutations).pipe(
                Effect.mapError(
                  error =>
                    new ZerospinError({
                      code:
                        'frontend-transition-staged-optimistic-mutations-invalid',
                      message:
                        'Live direct command optimistic mutations could not be decoded for transition',
                      cause: ZerospinError.prettyUnknownFailure(error),
                      extra: { commandId: stagedCommand.id },
                    }),
                ),
              );

              preparedStagedCommands.push({
                stagedCommand,
                adaptedCommand,
                currentMutations: current.mutations,
              });
            }

            return preparedStagedCommands;
          }).pipe(Effect.either);
          if (Either.isLeft(stagedCommandPreparation)) {
            yield* releaseTargetFrontendApi;
            if (isStagedCommandUpdateRequired) {
              return null;
            }
            return yield* stagedCommandPreparation.left;
          }

          yield* applyFrontendState({
            frontend,
            frontendVersion: targetAdmission.right.identity.frontendVersion,
            accountId: targetAdmission.right.identity.accountId,
            actorId: targetAdmission.right.identity.actorId,
            systemId: targetAdmission.right.identity.systemId,
            generationId: targetAdmission.right.identity.generationId,
            systemVersion: targetAdmission.right.identity.systemVersion,
            systemWorkerName: targetAdmission.right.identity.systemWorkerName,
            db,
            schema: dbConfig.schema,
            models,
            frontendState: targetFrontendState,
          }).pipe(Effect.tapError(() => releaseTargetFrontendApi));
          const stagedCommandAdaptation = yield* makeTx({
            db,
            program: Effect.fn(
              'bootstrapBrowserSession.adaptDirectTransitionStagedCommands',
            )(function* ({ tx }) {
              // 2 — remove command overlays newest-first across the whole
              // journal. Reversing one command and applying its replacement
              // before the next reversal would corrupt overlapping row/field
              // writes, so every source program is gone before loop 4 begins.
              for (
                let preparedCommandIndex =
                  stagedCommandPreparation.right.length - 1;
                preparedCommandIndex >= 0;
                preparedCommandIndex -= 1
              ) {
                const preparedStagedCommand =
                  stagedCommandPreparation.right[preparedCommandIndex];
                if (preparedStagedCommand === undefined) {
                  return yield* new ZerospinError({
                    code:
                      'frontend-transition-prepared-staged-command-missing',
                    message:
                      'Prepared direct command disappeared from its transition order',
                  });
                }
                const optimisticRow = tx
                  .select()
                  .from(sessionOptimisticAppliedMutationDrizzleSchema)
                  .where(
                    eq(
                      sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                      preparedStagedCommand.stagedCommand.id,
                    ),
                  )
                  .get();
                if (optimisticRow === undefined) {
                  return yield* new ZerospinError({
                    code:
                      'frontend-transition-staged-optimistic-mutations-missing',
                    message:
                      'Live direct command has no optimistic mutation record during transition',
                    extra: {
                      commandId: preparedStagedCommand.stagedCommand.id,
                    },
                  });
                }
                const priorEncodedMutations = yield* Schema.decode(
                  Schema.parseJson(
                    Schema.Array(EncodedAppliedMutationSchema),
                  ),
                )(optimisticRow.mutations).pipe(
                  Effect.mapError(
                    error =>
                      new ZerospinError({
                        code:
                          'frontend-transition-staged-optimistic-mutations-invalid',
                        message:
                          'Live direct command optimistic mutations could not be decoded for transition',
                        cause: ZerospinError.prettyUnknownFailure(error),
                        extra: {
                          commandId: preparedStagedCommand.stagedCommand.id,
                        },
                      }),
                  ),
                );

                // 3 — remove each source program in exact reverse mutation
                // order. applyFrontendState recomputed these inverses against
                // target state immediately before this transaction.
                for (const priorEncodedMutation of priorEncodedMutations.toSorted(
                  (left, right) => right.mutationIndex - left.mutationIndex,
                )) {
                  const model = yield* getByKeyOrThrow({
                    record: models,
                    key: priorEncodedMutation.modelName,
                    recordKind: 'frontend models',
                  });
                  const priorMutation = yield* decodeAppliedMutation({
                    mutation: priorEncodedMutation,
                    model,
                  });
                  yield* applyMutationInverseTx({
                    tx,
                    mutation: priorMutation,
                  });
                }
              }

              // 4 — install adapted commands oldest-first only after every old
              // optimistic overlay has been removed. Identity, IDs, cursors,
              // timestamps, and staging provenance remain unchanged.
              for (const preparedStagedCommand of stagedCommandPreparation.right) {
                tx.update(sessionStagedCommandDrizzleSchema)
                  .set(preparedStagedCommand.adaptedCommand)
                  .where(
                    eq(
                      sessionStagedCommandDrizzleSchema.id,
                      preparedStagedCommand.stagedCommand.id,
                    ),
                  )
                  .run();

                const nextEncodedAppliedMutations = [];
                // 5 — execute each current program in declaration order and
                // persist fresh inverses under the original command identity.
                for (const [
                  mutationIndex,
                  mutation,
                ] of preparedStagedCommand.currentMutations.entries()) {
                  const appliedMutation = yield* applyFrontendMutationTx({
                    tx,
                    mutation,
                    commandId: preparedStagedCommand.adaptedCommand.id,
                    mutationIndex,
                    appliedAt: preparedStagedCommand.stagedCommand.stagedAt,
                  });
                  nextEncodedAppliedMutations.push(
                    yield* encodeAppliedMutation({
                      mutation: appliedMutation,
                    }),
                  );
                }
                const encodedOptimisticMutations = yield* Schema.encode(
                  Schema.parseJson(
                    Schema.Array(EncodedAppliedMutationSchema),
                  ),
                )(nextEncodedAppliedMutations).pipe(
                  Effect.mapError(
                    error =>
                      new ZerospinError({
                        code:
                          'frontend-transition-staged-optimistic-mutations-encode-failed',
                        message:
                          'Adapted direct command optimistic mutations could not be encoded',
                        cause: ZerospinError.prettyUnknownFailure(error),
                        extra: {
                          commandId: preparedStagedCommand.stagedCommand.id,
                        },
                      }),
                  ),
                );
                tx.update(sessionOptimisticAppliedMutationDrizzleSchema)
                  .set({ mutations: encodedOptimisticMutations })
                  .where(
                    eq(
                      sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                      preparedStagedCommand.stagedCommand.id,
                    ),
                  )
                  .run();
              }
            }),
          }).pipe(Effect.either);
          if (Either.isLeft(stagedCommandAdaptation)) {
            yield* releaseTargetFrontendApi;
            if (isStagedCommandUpdateRequired) {
              return null;
            }
            return yield* stagedCommandAdaptation.left;
          }

          currentDirectIdentity = targetAdmission.right.identity;
          currentDirectLastRebasedPushedCursor =
            targetFrontendState.lastRebasedPushedCursor;
          currentFrontendIndex = targetFrontendState.frontendIndex;
          const state = session.store.getState();
          if (state.isInitialized) {
            session.store.setState({
              accountId: currentDirectIdentity.accountId,
              accountName: currentDirectIdentity.accountName,
              actorId: currentDirectIdentity.actorId,
              systemId: currentDirectIdentity.systemId,
              generationId: currentDirectIdentity.generationId,
              systemVersion: currentDirectIdentity.systemVersion,
              systemWorkerName: currentDirectIdentity.systemWorkerName,
              frontendName: currentDirectIdentity.frontendName,
              frontendVersion: currentDirectIdentity.frontendVersion,
              frontendIndex: currentFrontendIndex,
              lastRebasedPushedCursor:
                targetFrontendState.lastRebasedPushedCursor,
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
            error.code === 'frontend-admission-target-mismatch' ||
            error.code === 'frontend-websocket-regained-target-mismatch' ||
            error.code === 'frontend-websocket-transition-result-mismatch';
          if (isAuthorityRejection) {
            await Runtime.runPromise(runtime)(
              browserPartitionController.invalidateCachedAccountFrontendLocators(
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
          const failure: IAnyErrorJson = Schema.encodeSync(
            ZerospinError.schema,
          )(error);
          session.store.setState({
            sessionId: session.sessionId,
            accountId: null,
            accountName: null,
            actorId: null,
            systemId: null,
            generationId: null,
            systemVersion: null,
            systemWorkerName: null,
            frontendName: null,
            frontendVersion: null,
            db: null,
            schema: null,
            models: null,
            vfsName: null,
            isInitialized: false,
            frontendIndex: null,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
            isPushPaused: state.isPushPaused,
            isSharedWorkerEnabled: state.isSharedWorkerEnabled,
            workerState: {
              mode: 'direct',
              status: 'failed',
              bootstrapSource: null,
              frontendIndex: null,
              replicaIndex: null,
              databaseName: null,
              failure,
            },
            lastDevtoolsPush: state.lastDevtoolsPush,
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
            code: 'account-frontend-session-database-close-failed',
            message:
              'Failed to close the direct account frontend Provider database after WebSocket acquisition failure',
          }),
        }).pipe(Effect.ignore),
      ),
    );

    session.store.setState({
      sessionId: session.sessionId,
      accountId: currentDirectIdentity.accountId,
      accountName: currentDirectIdentity.accountName,
      actorId: currentDirectIdentity.actorId,
      systemId: currentDirectIdentity.systemId,
      generationId: currentDirectIdentity.generationId,
      systemVersion: currentDirectIdentity.systemVersion,
      systemWorkerName: currentDirectIdentity.systemWorkerName,
      frontendName: currentDirectIdentity.frontendName,
      frontendVersion: currentDirectIdentity.frontendVersion,
      db,
      schema: dbConfig.schema,
      models,
      vfsName: null,
      isInitialized: true,
      frontendIndex: currentFrontendIndex,
      replicaIndex: null,
      lastRebasedPushedCursor: currentDirectLastRebasedPushedCursor,
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
      db,
      schema: dbConfig.schema,
      models,
      actor: currentDirectIdentity.actor,
      releaseBrowserSession: releaseFrontendWebSocket.pipe(
        Effect.zipRight(
          Effect.promise(async () => {
            const state = session.store.getState();
            session.store.setState({
              sessionId: session.sessionId,
              accountId: null,
              accountName: null,
              actorId: null,
              systemId: null,
              generationId: null,
              systemVersion: null,
              systemWorkerName: null,
              frontendName: null,
              frontendVersion: null,
              db: null,
              schema: null,
              models: null,
              vfsName: null,
              isInitialized: false,
              frontendIndex: null,
              replicaIndex: null,
              lastRebasedPushedCursor: null,
              isPushPaused: state.isPushPaused,
              isSharedWorkerEnabled: state.isSharedWorkerEnabled,
              workerState: {
                mode: 'direct',
                status: 'released',
                bootstrapSource: null,
                frontendIndex: null,
                replicaIndex: null,
                databaseName: null,
                failure: null,
              },
              lastDevtoolsPush: state.lastDevtoolsPush,
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
  },
  annotateFunctionSpan,
);
