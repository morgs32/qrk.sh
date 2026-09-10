import type { IBackupWorker } from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { applyServiceFrontendCommand } from '@zerospin/core/serviceSession/applyServiceFrontendCommand';
import { applyServiceFrontendState } from '@zerospin/core/serviceSession/applyServiceFrontendState';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import {
  serviceSessionMetadataDrizzleSchema,
  serviceSessionRepoTables,
} from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceFrontendFinalizedCommand,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
import type { ISystemId } from '@zerospin/core/system/types';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { TelemetryCollector } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq, getTableName, sql } from 'drizzle-orm';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
} from 'effect';

import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket.ts';
import { fetchServiceFrontendState } from './fetchServiceFrontendState.ts';
import { frontendPushRetrySchedule } from './frontendPushRetrySchedule.ts';
import { makeServiceFrontendBackupKey } from './makeServiceFrontendBackupKey.ts';

/*
 * 1. Retain one synchronous live database and mounted store for this frontend.
 * 2. Scope database release to the Provider.
 * 3. Resolve authenticated identity, retaining the offline authentication locator.
 * 4. Acquire on visibility/focus/restoration and pause revoked ownership in place.
 * 5. Restore committed SQLite before establishing a fresh execution identity.
 * 6. Serialize incremental backup delivery and repair uncertain mutations with a snapshot.
 * 7. Publish the current period and run its scoped socket, reconciliation, and push work.
 */
export const bootstrapServiceFrontendSession = Effect.fn(
  'bootstrapServiceFrontendSession',
)(function* <
  FRONTEND extends IServiceFrontendController,
  MODELS extends IAnyModels,
>(props: {
  serviceVersion: string;
  session: IServiceSession<FRONTEND, MODELS>;
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  backupWorker: IBackupWorker;
}): Effect.fn.Return<
  Readonly<{ systemId: ISystemId; userId: string }>,
  IAnyError,
  Async | Scope.Scope | TelemetryCollector
> {
  const {
    apiUrl,
    authenticationLock,
    generateSignature,
    publishableKey,
    systemName,
  } = props;
  // 1 — Build the lock-keyed service schema and in-memory SQLite database
  // before exposing initialized state or accepting backup transactions.
  const { backupWorker, session } = props;
  const frontend = session.frontend;
  const models = session.models;
  const context = yield* Effect.context<Async | TelemetryCollector>();
  const completeFrontendSpec = makeFrontendControllerSpec(frontend);
  const serviceFrontendLock = {
    ...completeFrontendSpec.serviceFrontendLock,
    models: Object.fromEntries(
      Object.entries(models).map(([key, model]) => [
        key,
        {
          modelName: model.modelName,
          abbreviation: model.abbreviation,
          version: model.version,
          propertiesShape: model.spec.propertiesShape,
          indexes: model.indexes
            .toSorted((left, right) => left.name.localeCompare(right.name))
            .map(index => ({
              name: index.name,
              columns: [...index.columns],
              unique: index.unique ?? false,
            })),
        },
      ]),
    ),
  };
  const serviceFrontendLockKey =
    yield* makeServiceFrontendLockKey(serviceFrontendLock);
  const dbConfig = makeResourceDbConfig<
    MODELS,
    typeof serviceSessionRepoTables
  >({
    models,
    otherTables: serviceSessionRepoTables,
  });
  const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
  const emptyDatabase = db.$client.sqlite3.serialize(db.$client.db, 'main');
  const expectedSchema = JSON.stringify(
    db.all<{ type: string; name: string; sql: string }>(
      sql`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`,
    ),
  );
  let released = false;
  const transientCodes = new Set([
    'async-failed',
    'user-authentication-transport-failed',
    'gateway-infrastructure-failure',
    'system-deploy-activating',
    'system-deploy-failed',
    'system-not-ready',
    'service-frontend-websocket-open-failed',
    'service-frontend-finalized-replay-failed',
  ]);

  session.store.setState({
    sessionStatus: 'bootstrapping',
    backupState: { status: 'pending', failure: null },
  });

  // 2 — Scoped release stops backup capture, closes the retained socket and
  // database, closes SQLite, and publishes released state.
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      released = true;
      yield* Effect.try({
        try: () => db.$client.sqlite3.close(db.$client.db),
        catch: ZerospinError.catch({
          code: 'service-frontend-session-database-close-failed',
        }),
      }).pipe(Effect.ignore);
      session.store.setState({
        sessionStatus: 'released',
        backupState: { status: 'released', failure: null },
      });
    }).pipe(Effect.catch(() => Effect.void)),
  );

  // 3 — The exact offline locator supplies { systemId, userId } when present;
  // otherwise authentication supplies them before this frontend can select a backup.
  const authenticationLocatorKey = `zerospin:authentication:${JSON.stringify({
    apiUrl,
    publishableKey,
    systemName,
    authenticationLock,
  })}`;
  // A validated locator can select an existing local backup without waiting for the server.
  // Online recovery still authenticates and rejects a different or denied identity.
  const persistedIdentity = yield* Effect.try({
    try: () => localStorage.getItem(authenticationLocatorKey),
    catch: ZerospinError.catch({
      code: 'browser-persistence-reset-required',
      message: 'Failed to read the browser authentication locator',
    }),
  });
  let online = false;
  let systemId: ISystemId;
  let userId: string;
  if (persistedIdentity !== null) {
    const decodedIdentity = yield* Effect.try({
      try: () => JSON.parse(persistedIdentity),
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'The persisted authentication locator is invalid',
      }),
    }).pipe(
      Effect.flatMap(value =>
        Schema.decodeUnknownEffect(
          Schema.Struct({
            systemId: makeAbbreviationIdSchema('sys'),
            userId: Schema.String,
          }),
        )(value, { onExcessProperty: 'error' }).pipe(
          Effect.mapError(
            () =>
              new ZerospinError({
                code: 'browser-persistence-reset-required',
                message: 'The persisted authentication locator is invalid',
              }),
          ),
        ),
      ),
    );
    systemId = decodedIdentity.systemId;
    userId = decodedIdentity.userId;
  } else {
    const initialState = yield* fetchServiceFrontendState({
      serviceVersion: props.serviceVersion,
      apiUrl,
      publishableKey,
      systemName,
      authenticationLock,
      generateSignature,
      serviceName: frontend.serviceName,
      frontendName: frontend.name,
      serviceFrontendLock,
    });
    systemId = initialState.systemId;
    userId = initialState.userId;
    online = true;
    yield* Effect.try({
      try: () => {
        localStorage.setItem(
          authenticationLocatorKey,
          JSON.stringify({ systemId, userId }),
        );
      },
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'Failed to write the browser authentication locator',
      }),
    });
  }

  // 4 — Visibility signals acquire one revocable capability for this exact key.
  const backupKey = yield* makeServiceFrontendBackupKey({
    serviceVersion: props.serviceVersion,
    systemId,
    userId,
    serviceName: frontend.serviceName,
    frontendName: frontend.name,
    serviceFrontendLockKey,
  });
  const acquireSignal = yield* Queue.unbounded<void>();
  const initialized = yield* Deferred.make<void, IAnyError>();
  let hasOwned = false;
  let acquiringPeriod: { revoked: boolean } | null = null;
  let activePeriod: { revoked: boolean; scope: Scope.Closeable } | null = null;
  const requestOwnership = () => {
    if (document.visibilityState !== 'visible') {
      if (acquiringPeriod !== null) acquiringPeriod.revoked = true;
      if (
        activePeriod !== null &&
        session.store.getState().sessionStatus === 'bootstrapping'
      ) {
        activePeriod.revoked = true;
        session.store.setState({ sessionStatus: 'superseded' });
        Effect.runFork(Scope.close(activePeriod.scope, Exit.void));
      }
      return;
    }
    if (
      !released &&
      document.visibilityState === 'visible' &&
      Queue.sizeUnsafe(acquireSignal) === 0
    ) {
      Queue.offerUnsafe(acquireSignal, undefined);
    }
  };
  document.addEventListener('visibilitychange', requestOwnership);
  globalThis.addEventListener('focus', requestOwnership);
  globalThis.addEventListener('pageshow', requestOwnership);
  const removeDisconnectListener = backupWorker.onDisconnect(() => {
    if (activePeriod !== null) {
      activePeriod.revoked = true;
      session.store.setState({
        sessionStatus: 'superseded',
        backupState: { status: 'pending', failure: null },
      });
      Effect.runFork(Scope.close(activePeriod.scope, Exit.void));
    }
    requestOwnership();
  });
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      removeDisconnectListener();
      document.removeEventListener('visibilitychange', requestOwnership);
      globalThis.removeEventListener('focus', requestOwnership);
      globalThis.removeEventListener('pageshow', requestOwnership);
      if (activePeriod !== null) {
        activePeriod.revoked = true;
        yield* Scope.close(activePeriod.scope, Exit.void);
      }
    }),
  );
  requestOwnership();

  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        yield* Queue.take(acquireSignal);
        if (released || document.visibilityState !== 'visible') return;
        const period = { revoked: false, scope: yield* Scope.make() };
        acquiringPeriod = period;
        const revokeOwnership = () => {
          period.revoked = true;
          if (activePeriod === period) {
            session.store.setState({ sessionStatus: 'superseded' });
            Effect.runFork(Scope.close(period.scope, Exit.void));
          }
        };
        const acquisition = yield* backupWorker
          .acquireDb({ backupKey, onRevoked: revokeOwnership })
          .pipe(Effect.result);
        if (acquiringPeriod === period) acquiringPeriod = null;
        if (Result.isFailure(acquisition)) {
          yield* Scope.close(period.scope, Exit.void);
          // Revocation waits for a new eligibility signal; worker loss has already queued reconnection.
          if (
            period.revoked ||
            acquisition.failure.code === 'backup-db-revoked' ||
            Queue.sizeUnsafe(acquireSignal) > 0
          ) {
            return;
          }
          if (!hasOwned) {
            yield* Deferred.fail(initialized, acquisition.failure);
          } else {
            session.store.setState({
              ...(activePeriod === null || activePeriod.revoked
                ? ({ sessionStatus: 'failed' } satisfies {
                    sessionStatus: 'failed';
                  })
                : {}),
              backupState: {
                status: 'failed',
                failure: Schema.encodeSync(ZerospinError.schema)(
                  acquisition.failure,
                ),
              },
            });
          }
          return;
        }
        if (acquisition.success.status === 'current') {
          yield* Scope.close(period.scope, Exit.void);
          return;
        }
        const backupDb = acquisition.success.db;
        if (
          released ||
          period.revoked ||
          document.visibilityState !== 'visible'
        ) {
          yield* backupDb.dispose().pipe(Effect.ignore);
          yield* Scope.close(period.scope, Exit.void);
          return;
        }
        if (activePeriod !== null) {
          activePeriod.revoked = true;
          yield* Scope.close(activePeriod.scope, Exit.void);
        }
        activePeriod = period;
        session.store.setState({
          sessionStatus: 'bootstrapping',
          backupState: { status: 'pending', failure: null },
        });
        const executionSessionId = hasOwned
          ? Schema.decodeUnknownSync(makeAbbreviationIdSchema('sesn'))(
              `sesn_${crypto.randomUUID()}`,
            )
          : session.sessionId;
        let selectedSnapshot = acquisition.success.snapshot;
        const startupFiber = yield* Effect.forkIn(
          Effect.gen(function* () {
            let socket: WebSocket | null = null;
            let backupAccepting = false;

            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                period.revoked = true;
                backupAccepting = false;
                if (activePeriod === period) {
                  db.$client.onCommittedTransaction = null;
                }
                socket?.close(1000, 'ownership-ended');
                socket = null;
                yield* backupDb.dispose().pipe(Effect.ignore);
              }),
            );
            // Replace this handle's contents even for an absent backup; obsolete RAM is never a baseline.
            for (;;) {
              const snapshot = selectedSnapshot ?? emptyDatabase;
              const restored = yield* Effect.try({
                try: () => {
                  const sourceDb = db.$client.sqlite3.open_v2Sync(':memory:');
                  try {
                    const deserializeResult = db.$client.sqlite3.deserialize(
                      sourceDb,
                      'main',
                      snapshot,
                      snapshot.byteLength,
                      snapshot.byteLength,
                      1,
                    );
                    if (deserializeResult !== 0) {
                      throw new Error(
                        `sqlite3_deserialize failed with code ${deserializeResult}`,
                      );
                    }
                    const backupResult = db.$client.sqlite3.backup(
                      db.$client.db,
                      'main',
                      sourceDb,
                      'main',
                    );
                    if (backupResult !== 0) {
                      throw new Error(
                        `sqlite3_backup failed with code ${backupResult}`,
                      );
                    }
                  } finally {
                    db.$client.sqlite3.close(sourceDb);
                  }
                  if (selectedSnapshot !== null) {
                    const storedSchema = db.all<{
                      type: string;
                      name: string;
                      sql: string;
                    }>(
                      sql`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '__zerospin_backup_identity' ORDER BY name`,
                    );
                    if (JSON.stringify(storedSchema) !== expectedSchema) {
                      throw new Error(
                        'The backup SQLite schema is incompatible with this frontend',
                      );
                    }
                    const identityRows = db.all<{ backupKey: string }>(
                      sql`SELECT backupKey FROM __zerospin_backup_identity`,
                    );
                    if (
                      identityRows.length !== 1 ||
                      identityRows[0]?.backupKey !== backupKey
                    ) {
                      throw new Error(
                        'The backup identity does not match this frontend',
                      );
                    }
                    // Frontend backups keep one current cursor; journal occurrences retain prior identities.
                    if (
                      db
                        .select()
                        .from(serviceSessionMetadataDrizzleSchema)
                        .all().length !== 1
                    ) {
                      throw new Error(
                        'The backup must contain one current frontend metadata row',
                      );
                    }
                  }
                },
                catch: ZerospinError.catch({
                  code: 'browser-persistence-reset-required',
                  message:
                    'Failed to restore the current service frontend backup',
                }),
              }).pipe(Effect.result);
              if (Result.isSuccess(restored)) break;
              if (selectedSnapshot === null) return yield* restored.failure;
              // Incompatible disposable state is rebuilt through normal authoritative bootstrap.
              selectedSnapshot = null;
            }
            if (selectedSnapshot === null) {
              db.run(
                sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL)`,
              );
              db.run(
                sql`INSERT INTO __zerospin_backup_identity (backupKey) VALUES (${backupKey})`,
              );
            }
            const transactionQueue =
              yield* Queue.unbounded<readonly ICommittedSqlStatement[]>();
            backupAccepting = true;
            db.$client.onCommittedTransaction = statements => {
              if (backupAccepting && !period.revoked) {
                session.store.setState({
                  backupState: { status: 'pending', failure: null },
                });
                Queue.offerUnsafe(transactionQueue, statements);
              }
            };
            if (selectedSnapshot !== null) {
              db.update(serviceSessionMetadataDrizzleSchema)
                .set({ sessionId: executionSessionId })
                .run();
            }
            // 5 — recoverOnline captures state before subscribing from its published cursor, validates a
            // contiguous finalized replay, installs state, and retains the live socket.
            const reconnectSignal = yield* Queue.unbounded<void>();
            const recoverySemaphore = yield* Semaphore.make(1);
            const recoverOnline = recoverySemaphore.withPermits(1)(
              Effect.gen(function* () {
                socket?.close(1000, 'reconnecting');
                socket = null;
                const recoveryState = yield* fetchServiceFrontendState({
                  serviceVersion: props.serviceVersion,
                  apiUrl,
                  publishableKey,
                  systemName,
                  authenticationLock,
                  generateSignature,
                  serviceName: frontend.serviceName,
                  frontendName: frontend.name,
                  serviceFrontendLock,
                });
                const ticket = yield* createServiceFrontendWebSocketTicket({
                  serviceVersion: props.serviceVersion,
                  apiUrl,
                  publishableKey,
                  systemName,
                  authenticationLock,
                  generateSignature,
                  serviceName: frontend.serviceName,
                  frontendName: frontend.name,
                  serviceFrontendLock,
                });
                const bufferedCommands: IEncodedCommand<IServiceFrontendFinalizedCommand>[] =
                  [];
                const replayComplete = Promise.withResolvers<number>();
                const opened = Promise.withResolvers<void>();
                // Closing an interrupted setup must not leave an unobserved rejected promise.
                void opened.promise.catch(() => undefined);
                void replayComplete.promise.catch(() => undefined);
                socket = yield* Effect.try({
                  try: () => {
                    const url = new URL(apiUrl);
                    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                    url.pathname = '/ws-service-frontend-commands';
                    url.search = '';
                    url.searchParams.set('ticket', ticket.ticket);
                    const nextSocket = new WebSocket(url);
                    nextSocket.onopen = () => {
                      nextSocket.send(
                        JSON.stringify({
                          serviceIndex: recoveryState.serviceIndex,
                        }),
                      );
                      opened.resolve();
                    };
                    nextSocket.onerror = () =>
                      opened.reject(new Error('WebSocket open failed'));
                    nextSocket.onclose = () => {
                      const failure = new Error(
                        'WebSocket closed before finalized replay completed',
                      );
                      opened.reject(failure);
                      replayComplete.reject(failure);
                    };
                    nextSocket.onmessage = event => {
                      try {
                        const message = JSON.parse(String(event.data));
                        if (message.type === 'serviceFrontendCommand') {
                          bufferedCommands.push(message.sync);
                        } else if (message.type === 'replay-complete') {
                          replayComplete.resolve(message.serviceIndex);
                        } else if (message.type === 'state-required') {
                          replayComplete.reject(
                            new Error('Finalized socket requires state'),
                          );
                        }
                      } catch (cause) {
                        replayComplete.reject(cause);
                      }
                    };
                    return nextSocket;
                  },
                  catch: ZerospinError.catch({
                    code: 'service-frontend-websocket-open-failed',
                    message:
                      'Could not connect to the service frontend command stream',
                    preferCauseMessage: false,
                  }),
                });
                yield* Effect.tryPromise({
                  try: () => opened.promise,
                  catch: ZerospinError.catch({
                    code: 'service-frontend-websocket-open-failed',
                    message:
                      'Could not connect to the service frontend command stream',
                    preferCauseMessage: false,
                  }),
                });
                const replayTip = yield* Effect.tryPromise({
                  try: () => replayComplete.promise,
                  catch: ZerospinError.catch({
                    code: 'service-frontend-finalized-replay-failed',
                  }),
                });
                const decodedFinalized = [];
                for (const command of bufferedCommands) {
                  decodedFinalized.push(
                    yield* Schema.decodeUnknownEffect(
                      ServiceFrontendFinalizedCommandSchema,
                    )(command).pipe(
                      Effect.mapError(
                        () =>
                          new ZerospinError({
                            code: 'service-frontend-finalized-message-invalid',
                          }),
                      ),
                    ),
                  );
                }
                decodedFinalized.sort(
                  (left, right) => left.serviceIndex - right.serviceIndex,
                );
                if (
                  replayTip < recoveryState.serviceIndex ||
                  decodedFinalized.filter(
                    command => command.serviceIndex <= replayTip,
                  ).length !==
                    replayTip - recoveryState.serviceIndex ||
                  decodedFinalized.some(
                    (command, index) =>
                      command.serviceIndex !==
                        recoveryState.serviceIndex + index + 1 ||
                      command.serviceVersion !== recoveryState.serviceVersion,
                  )
                ) {
                  return yield* new ZerospinError({
                    code: 'service-frontend-finalized-replay-invalid',
                    message:
                      'Service finalized socket replay was incomplete or non-contiguous',
                  });
                }
                if (period.revoked) {
                  return yield* new ZerospinError({
                    code: 'backup-db-revoked',
                  });
                }
                db.$client.onCommittedTransaction = null;
                yield* applyServiceFrontendState({
                  frontend,
                  sessionId: executionSessionId,
                  userId,
                  systemId,
                  db,
                  models,
                  frontendState: recoveryState,
                });
                for (const command of decodedFinalized) {
                  if (command.serviceIndex <= recoveryState.serviceIndex) {
                    continue;
                  }
                  yield* applyServiceFrontendCommand({
                    frontend,
                    sessionId: executionSessionId,
                    db,
                    models,
                    command,
                  });
                }
                const currentSocket = socket;
                if (currentSocket === null) {
                  return yield* new ZerospinError({
                    code: 'service-frontend-websocket-open-failed',
                    message: 'The service frontend WebSocket was not retained',
                  });
                }
                currentSocket.onmessage = (event: MessageEvent) => {
                  void Effect.runPromiseWith(context)(
                    Effect.gen(function* () {
                      if (period.revoked || socket !== currentSocket) return;
                      const message = yield* Effect.try({
                        try: () => JSON.parse(String(event.data)),
                        catch: ZerospinError.catch({
                          code: 'service-frontend-finalized-message-invalid',
                        }),
                      });
                      if (message.type !== 'serviceFrontendCommand') return;
                      const command = yield* Schema.decodeUnknownEffect(
                        ServiceFrontendFinalizedCommandSchema,
                      )(message.sync).pipe(
                        Effect.mapError(
                          () =>
                            new ZerospinError({
                              code: 'service-frontend-finalized-message-invalid',
                            }),
                        ),
                      );
                      if (period.revoked || socket !== currentSocket) return;
                      const applied = yield* applyServiceFrontendCommand({
                        frontend,
                        sessionId: executionSessionId,
                        db,
                        models,
                        command,
                      });
                      if (
                        period.revoked ||
                        socket !== currentSocket ||
                        applied === 'duplicate'
                      ) {
                        return;
                      }
                      const nextMetadata = db
                        .select()
                        .from(serviceSessionMetadataDrizzleSchema)
                        .where(
                          eq(
                            serviceSessionMetadataDrizzleSchema.sessionId,
                            executionSessionId,
                          ),
                        )
                        .get();
                      if (nextMetadata !== undefined) {
                        session.store.setState({
                          serviceIndex: nextMetadata.serviceIndex,
                          serviceVersion: nextMetadata.serviceVersion,
                        });
                      }
                    }).pipe(
                      Effect.catch(() =>
                        Effect.sync(() => {
                          if (!period.revoked && socket === currentSocket) {
                            session.store.setState({ sessionStatus: 'failed' });
                          }
                          currentSocket.close(4003, 'failed');
                        }),
                      ),
                      Effect.forkIn(period.scope),
                    ),
                  );
                };
                currentSocket.onclose = () => {
                  if (
                    !released &&
                    !period.revoked &&
                    socket === currentSocket
                  ) {
                    online = false;
                    if (session.store.getState().sessionStatus === 'current') {
                      Queue.offerUnsafe(reconnectSignal, undefined);
                    }
                  }
                };
                online = true;
              }),
            );
            if (selectedSnapshot === null) {
              yield* recoverOnline;
            } else {
              online = false;
            }
            if (period.revoked) {
              return yield* new ZerospinError({ code: 'backup-db-revoked' });
            }
            const metadata = db
              .select()
              .from(serviceSessionMetadataDrizzleSchema)
              .where(
                eq(
                  serviceSessionMetadataDrizzleSchema.sessionId,
                  executionSessionId,
                ),
              )
              .get();
            if (metadata === undefined) {
              return yield* new ZerospinError({
                code: 'browser-persistence-reset-required',
                message: 'The restored service frontend metadata is missing',
              });
            }
            // 6 — One queue and semaphore serialize incremental delivery and snapshot repair.
            const backupSemaphore = yield* Semaphore.make(1);
            let backupEpoch = 0;
            const repairBackup = Effect.gen(function* () {
              if (period.revoked) {
                return yield* new ZerospinError({ code: 'backup-db-revoked' });
              }
              backupAccepting = false;
              backupEpoch += 1;
              session.store.setState({
                backupState: { status: 'repairing', failure: null },
              });
              const afterSnapshot: (readonly ICommittedSqlStatement[])[] = [];
              db.$client.onCommittedTransaction = statements => {
                if (!period.revoked) afterSnapshot.push(statements);
              };
              while (Queue.sizeUnsafe(transactionQueue) > 0) {
                yield* Queue.take(transactionQueue);
              }
              const snapshot = db.$client.sqlite3.serialize(
                db.$client.db,
                'main',
              );
              yield* backupDb.overwriteDb({ snapshot }).pipe(
                Effect.retry({
                  times: 1,
                  while: error =>
                    error.code === 'backup-request-uncertain' &&
                    !period.revoked,
                }),
              );
              if (period.revoked) {
                return yield* new ZerospinError({ code: 'backup-db-revoked' });
              }
              db.$client.onCommittedTransaction = statements => {
                if (backupAccepting && !period.revoked) {
                  session.store.setState({
                    backupState: { status: 'pending', failure: null },
                  });
                  Queue.offerUnsafe(transactionQueue, statements);
                }
              };
              for (const statements of afterSnapshot) {
                Queue.offerUnsafe(transactionQueue, statements);
              }
              backupAccepting = true;
              session.store.setState({
                backupState: {
                  status: afterSnapshot.length === 0 ? 'ready' : 'pending',
                  failure: null,
                },
              });
            });
            if (selectedSnapshot === null) {
              yield* repairBackup;
            } else {
              // Only renewal metadata is new; the acquired baseline already belongs to this key.
              while (Queue.sizeUnsafe(transactionQueue) > 0) {
                const statements = yield* Queue.take(transactionQueue);
                yield* backupDb
                  .applyStatements({ statements })
                  .pipe(
                    Effect.catch(error =>
                      error.code === 'backup-request-uncertain' &&
                      !period.revoked
                        ? repairBackup
                        : Effect.fail(error),
                    ),
                  );
              }
            }
            yield* Effect.forkScoped(
              Effect.forever(
                Effect.gen(function* () {
                  const statements = yield* Queue.take(transactionQueue);
                  const statementEpoch = backupEpoch;
                  if (!backupAccepting || period.revoked) return;
                  yield* backupSemaphore
                    .withPermits(1)(
                      Effect.gen(function* () {
                        if (
                          !backupAccepting ||
                          period.revoked ||
                          statementEpoch !== backupEpoch
                        ) {
                          return;
                        }
                        const applied = yield* backupDb
                          .applyStatements({ statements })
                          .pipe(Effect.result);
                        if (period.revoked) return;
                        if (Result.isFailure(applied)) {
                          if (
                            applied.failure.code !== 'backup-request-uncertain'
                          ) {
                            return yield* applied.failure;
                          }
                          yield* repairBackup;
                        } else if (Queue.sizeUnsafe(transactionQueue) === 0) {
                          session.store.setState({
                            backupState: { status: 'ready', failure: null },
                          });
                        }
                      }),
                    )
                    .pipe(
                      Effect.catch(error =>
                        Effect.sync(() => {
                          if (period.revoked) return;
                          if (error.code === 'backup-db-revoked') {
                            revokeOwnership();
                            return;
                          }
                          backupAccepting = false;
                          db.$client.onCommittedTransaction = null;
                          session.store.setState({
                            backupState: {
                              status: 'failed',
                              failure: Schema.encodeSync(ZerospinError.schema)(
                                error,
                              ),
                            },
                          });
                        }),
                      ),
                    );
                }),
              ),
            );
            if (period.revoked) {
              return yield* new ZerospinError({ code: 'backup-db-revoked' });
            }
            if (document.visibilityState !== 'visible') {
              revokeOwnership();
              return yield* new ZerospinError({ code: 'backup-db-revoked' });
            }
            // 7 — Publish only a restored, persisted ownership period on the original store.
            if (period.revoked || document.visibilityState !== 'visible') {
              revokeOwnership();
              return yield* new ZerospinError({ code: 'backup-db-revoked' });
            }
            hasOwned = true;
            session.store.setState({
              sessionId: executionSessionId,
              serviceName: frontend.serviceName,
              userId,
              systemId,
              frontendName: frontend.name,
              serviceFrontendLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              serviceIndex: metadata.serviceIndex,
              serviceVersion: metadata.serviceVersion,
              sessionStatus: 'current',
              backupState: { status: 'ready', failure: null },
            });
            db.$client.flushTableChanges(
              new Set(
                Object.values(dbConfig.schema).map(table =>
                  getTableName(table),
                ),
              ),
            );
            // 8 — Browser-online and socket-close signals share serialized recovery;
            // successful recovery replaces the shared backup baseline before refreshing frontiers.
            const onlineListener = () => {
              if (
                !released &&
                !period.revoked &&
                session.store.getState().sessionStatus === 'current'
              ) {
                Queue.offerUnsafe(reconnectSignal, undefined);
              }
            };
            globalThis.addEventListener('online', onlineListener);
            yield* Effect.addFinalizer(() =>
              Effect.sync(() =>
                globalThis.removeEventListener('online', onlineListener),
              ),
            );
            if (!online) {
              Queue.offerUnsafe(reconnectSignal, undefined);
            }
            yield* Effect.forkScoped(
              Effect.forever(
                Effect.gen(function* () {
                  yield* Queue.take(reconnectSignal);
                  while (Queue.sizeUnsafe(reconnectSignal) > 0) {
                    yield* Queue.take(reconnectSignal);
                  }
                  if (
                    released ||
                    period.revoked ||
                    session.store.getState().sessionStatus !== 'current'
                  ) {
                    return;
                  }
                  const recovered = yield* recoverOnline.pipe(
                    Effect.retry({
                      schedule: frontendPushRetrySchedule,
                      while: error =>
                        transientCodes.has(error.code) &&
                        !released &&
                        !period.revoked &&
                        session.store.getState().sessionStatus === 'current',
                    }),
                    Effect.result,
                  );
                  if (Result.isFailure(recovered)) {
                    if (
                      !released &&
                      !period.revoked &&
                      session.store.getState().sessionStatus === 'current'
                    ) {
                      socket?.close(4003, recovered.failure.code);
                      socket = null;
                      session.store.setState({ sessionStatus: 'failed' });
                    }
                    return;
                  }
                  while (online && Queue.sizeUnsafe(reconnectSignal) > 0) {
                    yield* Queue.take(reconnectSignal);
                  }

                  yield* backupSemaphore
                    .withPermits(1)(repairBackup)
                    .pipe(
                      Effect.catch(error =>
                        Effect.sync(() => {
                          if (period.revoked) return;
                          if (error.code === 'backup-db-revoked') {
                            revokeOwnership();
                            return;
                          }
                          backupAccepting = false;
                          db.$client.onCommittedTransaction = null;
                          session.store.setState({
                            backupState: {
                              status: 'failed',
                              failure: Schema.encodeSync(ZerospinError.schema)(
                                error,
                              ),
                            },
                          });
                        }),
                      ),
                    );
                  if (period.revoked) return;
                  const recoveredMetadata = db
                    .select()
                    .from(serviceSessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        serviceSessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (recoveredMetadata !== undefined) {
                    session.store.setState({
                      serviceIndex: recoveredMetadata.serviceIndex,
                      serviceVersion: recoveredMetadata.serviceVersion,
                    });
                  }
                  yield* Effect.try({
                    try: () =>
                      localStorage.setItem(
                        authenticationLocatorKey,
                        JSON.stringify({ systemId, userId }),
                      ),
                    catch: ZerospinError.catch({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Failed to refresh the browser authentication locator',
                    }),
                  });
                }),
              ),
            );

            yield* Deferred.succeed(initialized, undefined);
          }).pipe(Effect.provideService(Scope.Scope, period.scope)),
          period.scope,
        );
        const started = yield* Fiber.await(startupFiber);
        if (Exit.isFailure(started)) {
          const revoked = period.revoked;
          const typedFailure = Cause.findError(started.cause);
          const failure = Result.isSuccess(typedFailure)
            ? typedFailure.success
            : ZerospinError.catch({
                code: 'frontend-ownership-startup-failed',
              })(Cause.squash(started.cause));
          if (activePeriod === period && !revoked) {
            session.store.setState({
              sessionStatus: 'failed',
              backupState: {
                status: 'failed',
                failure: Schema.encodeSync(ZerospinError.schema)(failure),
              },
            });
          }
          yield* Scope.close(period.scope, Exit.void);
          if (!revoked) yield* Deferred.fail(initialized, failure);
        }
      }),
    ),
  );
  yield* Deferred.await(initialized);
  return { systemId, userId };
});
