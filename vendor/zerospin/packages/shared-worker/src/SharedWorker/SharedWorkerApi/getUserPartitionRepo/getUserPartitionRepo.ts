import type { Async } from '@zerospin/core/async/Async';
import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { authenticate } from '@zerospin/frontend/authenticate';
import type { TelemetryCollector } from '@zerospin/logger';
import { RpcStub } from 'capnweb';
import { Effect, Either, Schema, type ManagedRuntime } from 'effect';

import { makeAsyncWaSqliteDrizzle } from '../../../drizzle/makeAsyncWaSqliteDrizzle.ts';
import { makeIdbSQLite3 } from '../../../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../../../drizzle/types.ts';
import type { AggregateFrontendReplicaRepo } from '../../AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import {
  getLastUserPartition,
  openLastUserPartitionStore,
  setLastUserPartition,
} from '../../lastUserPartitionStore.ts';
import { makeVfsName } from '../../makeVfsName.ts';
import { migrateUserReplicaDbAsync } from '../../migrateUserReplicaDbAsync.ts';
import type { ServiceFrontendReplicaRepo } from '../../ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import { UserPartitionRepo } from '../../UserPartitionRepo/UserPartitionRepo.ts';
import { userReplicaDbConfig } from '../../userReplicaSchemas.ts';
import { dispose } from '../dispose/dispose.ts';

const userPartitionDatabaseName = 'replicas.db';

export const getUserPartitionRepo = Effect.fn(
  'SharedWorkerApi.getUserPartitionRepo',
)(
  (props: {
    request: {
      systemName: string;
      authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
      generateSignature:
        | RpcStub<() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>>
        | (() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>);
    };
    authenticationState: {
      configuration: null | {
        systemName: string;
        authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
        generateSignature:
          | RpcStub<() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>>
          | (() => Promise<Schema.EitherEncoded<unknown, IAnyErrorJson>>);
      };
      boundIdentity: null | {
        systemId: ISystemId;
        userId: string;
        systemName: string;
      };
      current: null | Effect.Effect.Success<ReturnType<typeof authenticate>>;
      pending: null | {
        token: object;
        promise: Promise<
          Effect.Effect.Success<ReturnType<typeof authenticate>>
        >;
        failureSource: null | 'authentication' | 'callback' | 'capability';
      };
      lastFailure: null | {
        token: object;
        error: IAnyError;
        source: 'authentication' | 'callback' | 'capability';
      };
      terminalError: IAnyError | null;
    };
    authenticationRuntime: ManagedRuntime.ManagedRuntime<
      Async | PublishableKey | TelemetryCollector | ZerospinApiUrl,
      IAnyError
    >;
    ownerToken: object;
    runtime: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
    sharedWorkerWasmUrl: string;
    sharedWorkerApiUrl: string;
    sharedWorkerPublishableKey: string;
    userReplicaStores: Map<
      string,
      {
        userId: string;
        userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
        db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
        systemId: string;
        vfsName: string;
        acquisitionTail: Promise<void>;
      }
    >;
    userReplicaOpenPromises: Map<
      string,
      Promise<{
        userId: string;
        userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
        db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
        systemId: string;
        vfsName: string;
        acquisitionTail: Promise<void>;
      }>
    >;
    aggregateReplicaRuntimes: Map<string, AggregateFrontendReplicaRepo>;
    serviceReplicaRuntimes: Map<string, ServiceFrontendReplicaRepo>;
    allocateRegistrationId: () => number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        try {
          if (props.authenticationState.terminalError !== null) {
            throw props.authenticationState.terminalError;
          }

          const systemName = Schema.decodeUnknownSync(Schema.NonEmptyString)(
            props.request.systemName,
          );
          const authenticationLock = Schema.decodeUnknownSync(
            AuthenticationLockSchema,
          )(props.request.authenticationLock, { onExcessProperty: 'error' });
          const existingConfiguration = props.authenticationState.configuration;
          if (existingConfiguration === null) {
            props.authenticationState.configuration = {
              systemName,
              authenticationLock,
              generateSignature:
                props.request.generateSignature instanceof RpcStub
                  ? props.request.generateSignature.dup()
                  : props.request.generateSignature,
            };
            if (props.request.generateSignature instanceof RpcStub) {
              props.request.generateSignature[Symbol.dispose]();
            }
          } else {
            if (props.request.generateSignature instanceof RpcStub) {
              props.request.generateSignature[Symbol.dispose]();
            }
            if (
              existingConfiguration.systemName !== systemName ||
              JSON.stringify(existingConfiguration.authenticationLock) !==
                JSON.stringify(authenticationLock)
            ) {
              const failure = new ZerospinError({
                code: 'shared-worker-port-authentication-configuration-mismatch',
                message:
                  'The SharedWorker port was already bound to another authentication configuration',
              });
              Effect.runSync(
                dispose({
                  ...props,
                  terminalError: failure,
                }),
              );
              throw failure;
            }
          }

          const getAuthenticatedApi = async (request: {
            freshness: 'current' | 'refresh-if-current' | 'force';
            failedAuthenticatedApi:
              | Effect.Effect.Success<
                  ReturnType<typeof authenticate>
                >['authenticatedApi']
              | null;
          }) => {
            if (props.authenticationState.terminalError !== null) {
              throw props.authenticationState.terminalError;
            }
            if (props.authenticationState.pending !== null) {
              return props.authenticationState.pending.promise;
            }
            if (
              request.freshness === 'current' &&
              props.authenticationState.current !== null
            ) {
              return props.authenticationState.current;
            }
            if (
              request.freshness === 'refresh-if-current' &&
              props.authenticationState.current !== null &&
              props.authenticationState.current.authenticatedApi !==
                request.failedAuthenticatedApi
            ) {
              return props.authenticationState.current;
            }

            const configuration = props.authenticationState.configuration;
            if (configuration === null) {
              throw new ZerospinError({
                code: 'shared-worker-authentication-configuration-missing',
                message:
                  'The SharedWorker port has no authentication configuration',
              });
            }

            const attemptToken = {};
            const pendingResult =
              Promise.withResolvers<
                Effect.Effect.Success<ReturnType<typeof authenticate>>
              >();
            const pendingAttempt: {
              token: object;
              promise: Promise<
                Effect.Effect.Success<ReturnType<typeof authenticate>>
              >;
              failureSource:
                | null
                | 'authentication'
                | 'callback'
                | 'capability';
            } = {
              token: attemptToken,
              promise: pendingResult.promise,
              failureSource: null,
            };
            const boundIdentity = props.authenticationState.boundIdentity;
            const previousAuthenticated = props.authenticationState.current;
            props.authenticationState.pending = pendingAttempt;
            props.authenticationState.lastFailure = null;

            void props.authenticationRuntime
              .runPromise(
                authenticate({
                  authenticationLock: configuration.authenticationLock,
                  generateSignature: () =>
                    Effect.tryPromise({
                      try: () => configuration.generateSignature(),
                      catch: cause =>
                        ZerospinError.isZerospinError(cause)
                          ? cause
                          : new ZerospinError({
                              code: 'authentication-signature-capability-failed',
                              message:
                                'Failed to invoke the page authentication signature capability',
                              cause: ZerospinError.prettyUnknownFailure(cause),
                            }),
                    }).pipe(
                      Effect.tapError(() =>
                        Effect.sync(() => {
                          pendingAttempt.failureSource = 'capability';
                        }),
                      ),
                      Effect.flatMap(encoded =>
                        decodeRpc(encoded).pipe(
                          Effect.tapError(() =>
                            Effect.sync(() => {
                              pendingAttempt.failureSource = 'callback';
                            }),
                          ),
                        ),
                      ),
                    ),
                }).pipe(Effect.either),
              )
              .then(result => {
                if (Either.isLeft(result)) {
                  const source =
                    pendingAttempt.failureSource ?? 'authentication';
                  pendingAttempt.failureSource = source;
                  props.authenticationState.lastFailure = {
                    token: attemptToken,
                    error: result.left,
                    source,
                  };
                  const isTransient =
                    source === 'capability' ||
                    (source === 'callback' &&
                      result.left.code !== 'authentication-signature-invalid' &&
                      result.left.code !== 'failed-to-decode-rpc') ||
                    (source === 'authentication' &&
                      [
                        'user-authentication-transport-failed',
                        'gateway-infrastructure-failure',
                        'system-deploy-activating',
                        'system-deploy-failed',
                        'system-not-ready',
                      ].includes(result.left.code));
                  if (!isTransient) {
                    Effect.runSync(
                      dispose({
                        ...props,
                        terminalError: result.left,
                      }),
                    );
                  }
                  pendingResult.reject(result.left);
                  return;
                }

                const authenticated = result.right;
                if (
                  props.authenticationState.terminalError !== null ||
                  props.authenticationState.configuration !== configuration ||
                  props.authenticationState.pending !== pendingAttempt ||
                  props.authenticationState.boundIdentity !== boundIdentity ||
                  props.authenticationState.current !== previousAuthenticated
                ) {
                  authenticated.releaseAuthenticatedApi();
                  pendingResult.reject(
                    props.authenticationState.terminalError ??
                      new ZerospinError({
                        code: 'shared-worker-authentication-attempt-stale',
                        message:
                          'The SharedWorker authentication attempt was superseded',
                      }),
                  );
                  return;
                }

                if (
                  authenticated.systemName !== configuration.systemName ||
                  (boundIdentity !== null &&
                    (authenticated.systemId !== boundIdentity.systemId ||
                      authenticated.userId !== boundIdentity.userId ||
                      authenticated.systemName !== boundIdentity.systemName))
                ) {
                  const failure = new ZerospinError({
                    code: 'shared-worker-authenticated-user-identity-mismatch',
                    message:
                      'SharedWorker authentication returned another system or user',
                  });
                  authenticated.releaseAuthenticatedApi();
                  Effect.runSync(
                    dispose({
                      ...props,
                      terminalError: failure,
                    }),
                  );
                  pendingResult.reject(failure);
                  return;
                }

                if (boundIdentity === null) {
                  props.authenticationState.boundIdentity = {
                    systemId: authenticated.systemId,
                    userId: authenticated.userId,
                    systemName: authenticated.systemName,
                  };
                }
                props.authenticationState.current = authenticated;
                previousAuthenticated?.releaseAuthenticatedApi();
                pendingResult.resolve(authenticated);
              })
              .catch(cause => {
                const failure = ZerospinError.isZerospinError(cause)
                  ? cause
                  : new ZerospinError({
                      code: 'shared-worker-authentication-failed',
                      message: 'SharedWorker authentication failed',
                      cause: ZerospinError.prettyUnknownFailure(cause),
                    });
                props.authenticationState.lastFailure = {
                  token: attemptToken,
                  error: failure,
                  source: pendingAttempt.failureSource ?? 'authentication',
                };
                Effect.runSync(
                  dispose({
                    ...props,
                    terminalError: failure,
                  }),
                );
                pendingResult.reject(failure);
              });

            try {
              return await pendingAttempt.promise;
            } finally {
              if (props.authenticationState.pending === pendingAttempt) {
                props.authenticationState.pending = null;
              }
            }
          };

          let authenticated: null | Effect.Effect.Success<
            ReturnType<typeof authenticate>
          > = null;
          let initialAuthenticationFailure: IAnyError | null = null;
          try {
            authenticated = await getAuthenticatedApi({
              freshness: 'current',
              failedAuthenticatedApi: null,
            });
          } catch (cause) {
            if (!ZerospinError.isZerospinError(cause)) throw cause;
            const failure = props.authenticationState.lastFailure;
            if (
              failure?.error !== cause ||
              failure.source !== 'authentication' ||
              ![
                'user-authentication-transport-failed',
                'gateway-infrastructure-failure',
                'system-deploy-activating',
                'system-deploy-failed',
                'system-not-ready',
              ].includes(cause.code)
            ) {
              throw cause;
            }
            initialAuthenticationFailure = cause;
          }

          const openedLocatorDatabase = await props.runtime.runPromise(
            openLastUserPartitionStore().pipe(Effect.either),
          );
          if (Either.isLeft(openedLocatorDatabase)) {
            throw openedLocatorDatabase.left;
          }
          const locatorDatabase = openedLocatorDatabase.right;
          try {
            const configuration = props.authenticationState.configuration;
            if (configuration === null) {
              throw (
                props.authenticationState.terminalError ??
                new ZerospinError({
                  code: 'shared-worker-authentication-configuration-missing',
                  message:
                    'The SharedWorker port has no authentication configuration',
                })
              );
            }
            const locatorKey = JSON.stringify({
              apiUrl: props.sharedWorkerApiUrl,
              publishableKey: props.sharedWorkerPublishableKey,
              systemName: configuration.systemName,
              authenticationLock: configuration.authenticationLock,
            });

            let mode: 'online' | 'existing-only';
            let systemId: ISystemId;
            let userId: string;
            if (authenticated !== null) {
              mode = 'online';
              systemId = authenticated.systemId;
              userId = authenticated.userId;
            } else {
              if (initialAuthenticationFailure === null) {
                throw new ZerospinError({
                  code: 'shared-worker-initial-authentication-result-missing',
                  message:
                    'SharedWorker initial authentication produced no result',
                });
              }
              const locatedUserPartition = await props.runtime.runPromise(
                getLastUserPartition({
                  database: locatorDatabase,
                  key: locatorKey,
                }).pipe(Effect.either),
              );
              if (Either.isLeft(locatedUserPartition)) {
                throw locatedUserPartition.left;
              }
              const locator = locatedUserPartition.right;
              if (locator === null) {
                throw new ZerospinError({
                  code: 'offline-user-locator-unavailable',
                  message:
                    'No user partition is available offline for this configuration',
                });
              }
              mode = 'existing-only';
              systemId = locator.systemId;
              userId = locator.userId;
              const boundIdentity = props.authenticationState.boundIdentity;
              if (boundIdentity === null) {
                props.authenticationState.boundIdentity = {
                  systemId,
                  userId,
                  systemName: configuration.systemName,
                };
              } else if (
                boundIdentity.systemId !== systemId ||
                boundIdentity.userId !== userId ||
                boundIdentity.systemName !== configuration.systemName
              ) {
                const failure = new ZerospinError({
                  code: 'shared-worker-authenticated-user-identity-mismatch',
                  message:
                    'The offline locator targets another bound SharedWorker port identity',
                });
                Effect.runSync(
                  dispose({
                    ...props,
                    terminalError: failure,
                  }),
                );
                throw failure;
              }
            }

            const boundIdentity = props.authenticationState.boundIdentity;
            if (
              props.authenticationState.terminalError !== null ||
              boundIdentity === null ||
              boundIdentity.systemId !== systemId ||
              boundIdentity.userId !== userId ||
              boundIdentity.systemName !== configuration.systemName ||
              (authenticated !== null &&
                props.authenticationState.current !== authenticated)
            ) {
              throw (
                props.authenticationState.terminalError ??
                new ZerospinError({
                  code: 'shared-worker-user-partition-acquisition-stale',
                  message:
                    'The SharedWorker port changed during user partition acquisition',
                })
              );
            }

            const userReplicaStoreKey = `${systemId}/${userId}`;
            let userReplicaStore =
              props.userReplicaStores.get(userReplicaStoreKey);
            if (userReplicaStore === undefined) {
              let openPromise =
                props.userReplicaOpenPromises.get(userReplicaStoreKey);
              let ownsOpenPromise = false;
              if (openPromise === undefined) {
                ownsOpenPromise = true;
                openPromise = props.runtime
                  .runPromise(
                    Effect.gen(function* () {
                      const vfsName = yield* makeVfsName({ systemId, userId });
                      let userReplicaSqlite: Awaited<
                        ReturnType<typeof makeIdbSQLite3>
                      > | null = null;
                      return yield* Effect.gen(function* () {
                        userReplicaSqlite = yield* Effect.tryPromise({
                          try: () =>
                            makeIdbSQLite3({
                              databaseName: userPartitionDatabaseName,
                              mode:
                                mode === 'online'
                                  ? 'create-or-open'
                                  : 'existing-only',
                              vfsName,
                              wasmUrl: props.sharedWorkerWasmUrl,
                            }),
                          catch: cause =>
                            ZerospinError.isZerospinError(cause)
                              ? cause
                              : new ZerospinError({
                                  code: 'open-shared-worker-user-replica-db-failed',
                                  message:
                                    'Failed to open SharedWorker user replica DB',
                                  cause:
                                    ZerospinError.prettyUnknownFailure(cause),
                                }),
                        });
                        const db = makeAsyncWaSqliteDrizzle(
                          userReplicaSqlite,
                          userReplicaDbConfig,
                        );
                        yield* migrateUserReplicaDbAsync({
                          db,
                          mode:
                            mode === 'online'
                              ? 'create-or-open'
                              : 'existing-only',
                        });

                        const currentBoundIdentity =
                          props.authenticationState.boundIdentity;
                        if (
                          props.authenticationState.terminalError !== null ||
                          props.authenticationState.configuration !==
                            configuration ||
                          currentBoundIdentity === null ||
                          currentBoundIdentity.systemId !== systemId ||
                          currentBoundIdentity.userId !== userId ||
                          currentBoundIdentity.systemName !==
                            configuration.systemName ||
                          (authenticated !== null &&
                            props.authenticationState.current !== authenticated)
                        ) {
                          const failure =
                            props.authenticationState.terminalError ??
                            new ZerospinError({
                              code: 'shared-worker-user-partition-acquisition-stale',
                              message:
                                'The SharedWorker port changed while opening its user partition',
                            });
                          return yield* failure;
                        }

                        if (mode === 'online') {
                          yield* setLastUserPartition({
                            database: locatorDatabase,
                            record: { key: locatorKey, systemId, userId },
                          });
                        }
                        const publishingBoundIdentity =
                          props.authenticationState.boundIdentity;
                        if (
                          props.authenticationState.terminalError !== null ||
                          props.authenticationState.configuration !==
                            configuration ||
                          publishingBoundIdentity === null ||
                          publishingBoundIdentity.systemId !== systemId ||
                          publishingBoundIdentity.userId !== userId ||
                          publishingBoundIdentity.systemName !==
                            configuration.systemName ||
                          (authenticated !== null &&
                            props.authenticationState.current !== authenticated)
                        ) {
                          const failure =
                            props.authenticationState.terminalError ??
                            new ZerospinError({
                              code: 'shared-worker-user-partition-acquisition-stale',
                              message:
                                'The SharedWorker port changed before publishing its user partition',
                            });
                          return yield* failure;
                        }
                        const opened = {
                          userId,
                          userReplicaSqlite,
                          db,
                          systemId,
                          vfsName,
                          acquisitionTail: Promise.resolve(),
                        };
                        props.userReplicaStores.set(
                          userReplicaStoreKey,
                          opened,
                        );
                        userReplicaSqlite = null;
                        return opened;
                      }).pipe(
                        Effect.ensuring(
                          Effect.suspend(() => {
                            if (userReplicaSqlite === null) return Effect.void;
                            const unpublishedUserReplicaSqlite =
                              userReplicaSqlite;
                            userReplicaSqlite = null;
                            return Effect.promise(() =>
                              unpublishedUserReplicaSqlite.sqlite3
                                .close(unpublishedUserReplicaSqlite.db)
                                .catch(() => undefined),
                            ).pipe(
                              Effect.andThen(
                                Effect.promise(() =>
                                  unpublishedUserReplicaSqlite.vfs
                                    .close()
                                    .catch(() => undefined),
                                ),
                              ),
                            );
                          }),
                        ),
                      );
                    }).pipe(Effect.either),
                  )
                  .then(opened => {
                    if (Either.isLeft(opened)) throw opened.left;
                    return opened.right;
                  });
                props.userReplicaOpenPromises.set(
                  userReplicaStoreKey,
                  openPromise,
                );
              }

              try {
                userReplicaStore = await openPromise;
              } finally {
                if (
                  props.userReplicaOpenPromises.get(userReplicaStoreKey) ===
                  openPromise
                ) {
                  props.userReplicaOpenPromises.delete(userReplicaStoreKey);
                }
              }

              if (!ownsOpenPromise && mode === 'online') {
                const locatorWrite = await props.runtime.runPromise(
                  setLastUserPartition({
                    database: locatorDatabase,
                    record: { key: locatorKey, systemId, userId },
                  }).pipe(Effect.either),
                );
                if (Either.isLeft(locatorWrite)) throw locatorWrite.left;
              }
            } else if (mode === 'online') {
              const locatorWrite = await props.runtime.runPromise(
                setLastUserPartition({
                  database: locatorDatabase,
                  record: { key: locatorKey, systemId, userId },
                }).pipe(Effect.either),
              );
              if (Either.isLeft(locatorWrite)) throw locatorWrite.left;
            }

            if (
              props.authenticationState.terminalError !== null ||
              props.authenticationState.boundIdentity !== boundIdentity ||
              props.authenticationState.configuration !== configuration ||
              (authenticated !== null &&
                props.authenticationState.current !== authenticated)
            ) {
              throw (
                props.authenticationState.terminalError ??
                new ZerospinError({
                  code: 'shared-worker-user-partition-acquisition-stale',
                  message:
                    'The SharedWorker port changed before publishing its user partition',
                })
              );
            }

            return {
              api: new UserPartitionRepo({
                ...props,
                systemId,
                userId,
                systemName: configuration.systemName,
                portState: props.authenticationState,
                getAuthenticatedApi,
                getCurrentAuthenticatedApi: () =>
                  props.authenticationState.terminalError === null
                    ? (props.authenticationState.current?.authenticatedApi ??
                      null)
                    : null,
              }),
              systemId,
              userId,
              mode,
            };
          } finally {
            locatorDatabase.close();
          }
        } catch (cause) {
          const failure = ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'get-user-partition-repo-failed',
                message: 'Failed to open the SharedWorker user partition',
                cause: ZerospinError.prettyUnknownFailure(cause),
              });
          if (
            props.authenticationState.configuration === null &&
            props.request.generateSignature instanceof RpcStub
          ) {
            props.request.generateSignature[Symbol.dispose]();
          }
          Effect.runSync(
            dispose({
              ...props,
              terminalError: failure,
            }),
          );
          throw props.authenticationState.terminalError ?? failure;
        }
      },
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'get-user-partition-repo-failed',
              message: 'Failed to open the SharedWorker user partition',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    }),
);
