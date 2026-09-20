import type { IBackupWorker } from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { applyServiceSelectedCommand } from '@zerospin/core/serviceSession/applyServiceSelectedCommand';
import { applyServiceFrontendSnapshot } from '@zerospin/core/serviceSession/applyServiceFrontendSnapshot';
import { ServiceSelectedCommandSchema } from '@zerospin/core/serviceSession/ServiceSelectedCommandSchema';
import {
  serviceSessionMetadataDrizzleSchema,
  serviceSessionRepoTables,
} from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSelectedCommand,
  IServiceSession,
} from '@zerospin/core/serviceSession/types';
import {
  mapParseError,
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
import { fetchServiceFrontendSnapshot } from './fetchServiceFrontendSnapshot.ts';
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
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  claimBackup(props: {
    backupKey: string;
  }): Effect.Effect<IBackupWorker, IAnyError, Scope.Scope>;
}): Effect.fn.Return<
  Readonly<{
    authentication: Readonly<Record<string, unknown>>;
  }>,
  IAnyError,
  Async | Scope.Scope | TelemetryCollector
> {
  const { apiUrl, generateSignature, publishableKey, systemName } = props;
  // 1 — Build the lock-keyed service schema and in-memory SQLite database
  // before exposing initialized state or accepting backup transactions.
  const { session } = props;
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
    'service-frontend-selected-replay-failed',
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

  // 3 — Current authentication chooses the backup; offline metadata only locates an existing copy.
  const authenticationLocatorKey = `zerospin:authentication:${JSON.stringify({
    apiUrl,
    publishableKey,
    systemName,
    frontendName: frontend.name,
    serviceName: frontend.serviceName,
    serviceVersion: props.serviceVersion,
    serviceFrontendLockKey,
  })}`;
  const persistedIdentity = yield* Effect.try({
    try: () => localStorage.getItem(authenticationLocatorKey),
    catch: ZerospinError.catch({
      code: 'browser-persistence-reset-required',
      message: 'Could not read the offline frontend locator',
    }),
  });
  let online = false;
  let authentication: Readonly<Record<string, unknown>> | null = null;
  let authenticationHash: string;
  const initial = yield* fetchServiceFrontendSnapshot({
    serviceVersion: props.serviceVersion,
    serviceName: frontend.serviceName,
    serviceFrontendLock,
    apiUrl,
    publishableKey,
    systemName,
    generateSignature,
    frontendName: frontend.name,
  }).pipe(Effect.result);
  if (Result.isSuccess(initial)) {
    authentication = yield* Schema.encodeEffect(
      frontend.authentication.authenticationSchema,
    )(initial.success.authentication).pipe(
      mapParseError({
        code: 'frontend-authentication-invalid',
        prefix: 'Invalid decoded authentication',
      }),
    );
    const authenticationKeys = new Set<string>();
    const authenticationValues: unknown[] = [authentication];
    while (authenticationValues.length > 0) {
      const value = authenticationValues.pop();
      if (Array.isArray(value)) {
        authenticationValues.push(...value);
      } else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          authenticationKeys.add(key);
          authenticationValues.push(child);
        }
      }
    }
    const authenticationDigest = yield* Effect.tryPromise({
      try: () =>
        crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify(authentication, [...authenticationKeys].sort()),
          ),
        ),
      catch: ZerospinError.catch({
        code: 'authentication-hash-failed',
        message: 'Could not hash authentication',
      }),
    });
    authenticationHash = [...new Uint8Array(authenticationDigest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    online = true;
  } else {
    if (
      !transientCodes.has(initial.failure.code) ||
      persistedIdentity === null
    ) {
      return yield* initial.failure;
    }
    const locator = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          authenticationHash: Schema.String.check(
            Schema.isPattern(/^[a-f0-9]{64}$/),
          ),
        }),
      ),
    )(persistedIdentity, { onExcessProperty: 'error' }).pipe(
      Effect.mapError(
        () =>
          new ZerospinError({
            code: 'browser-persistence-reset-required',
            message: 'The offline frontend locator is invalid',
          }),
      ),
    );
    authenticationHash = locator.authenticationHash;
  }

  // 4 — Visibility signals acquire one revocable capability for this exact key.
  const backupKey = yield* makeServiceFrontendBackupKey({
    serviceVersion: props.serviceVersion,
    authenticationHash,
    serviceName: frontend.serviceName,
    frontendName: frontend.name,
    serviceFrontendLockKey,
  });
  const backupWorker = yield* props.claimBackup({ backupKey });
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
        if (executionSessionId === null) {
          return yield* new ZerospinError({
            code: 'service-frontend-session-not-ready',
            message: 'Bootstrap requires a bound session id',
          });
        }
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
                    const identityRows = db.all<{
                      backupKey: string;
                      authentication: string;
                    }>(
                      sql`SELECT backupKey, authentication FROM __zerospin_backup_identity`,
                    );
                    if (
                      identityRows.length !== 1 ||
                      identityRows[0]?.backupKey !== backupKey
                    ) {
                      throw new Error(
                        'The backup identity does not match this frontend',
                      );
                    }
                    authentication = Schema.decodeUnknownSync(
                      Schema.fromJsonString(
                        Schema.Record(Schema.String, Schema.Unknown),
                      ),
                    )(identityRows[0]?.authentication);

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
                sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL, authentication TEXT)`,
              );
              db.run(
                sql`INSERT INTO __zerospin_backup_identity (backupKey, authentication) VALUES (${backupKey}, ${JSON.stringify(authentication)})`,
              );
            }
            if (authentication !== null) {
              const authenticationKeys = new Set<string>();
              const authenticationValues: unknown[] = [authentication];
              while (authenticationValues.length > 0) {
                const value = authenticationValues.pop();
                if (Array.isArray(value)) {
                  authenticationValues.push(...value);
                } else if (value !== null && typeof value === 'object') {
                  for (const [key, child] of Object.entries(value)) {
                    authenticationKeys.add(key);
                    authenticationValues.push(child);
                  }
                }
              }
              const authenticationDigest = yield* Effect.tryPromise({
                try: () =>
                  crypto.subtle.digest(
                    'SHA-256',
                    new TextEncoder().encode(
                      JSON.stringify(
                        authentication,
                        [...authenticationKeys].sort(),
                      ),
                    ),
                  ),
                catch: ZerospinError.catch({
                  code: 'authentication-hash-failed',
                  message: 'Could not hash authentication',
                }),
              });
              const restoredHash = [...new Uint8Array(authenticationDigest)]
                .map(byte => byte.toString(16).padStart(2, '0'))
                .join('');
              if (restoredHash !== authenticationHash) {
                return yield* new ZerospinError({
                  code: 'browser-persistence-reset-required',
                  message: 'Backup authentication does not match its partition',
                });
              }
              yield* Schema.decodeUnknownEffect(
                frontend.authentication.authenticationSchema,
              )(authentication).pipe(
                Effect.mapError(
                  () =>
                    new ZerospinError({
                      code: 'backup-authentication-invalid',
                      message:
                        'Backup authentication is unsupported by this frontend',
                    }),
                ),
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
            // 5 — Resume from the local service checkpoint. Matching history
            // receives a contiguous suffix; state-required replaces the entire DB.
            const reconnectSignal = yield* Queue.unbounded<void>();
            const recoverySemaphore = yield* Semaphore.make(1);
            const restoreLiveDatabase = (snapshot: Uint8Array) => {
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
            };
            const recoverOnline = recoverySemaphore.withPermits(1)(
              Effect.gen(function* () {
                socket?.close(1000, 'reconnecting');
                socket = null;

                const hashAuthentication = (value: unknown) =>
                  Effect.gen(function* () {
                    const authenticationKeys = new Set<string>();
                    const authenticationValues: unknown[] = [value];
                    while (authenticationValues.length > 0) {
                      const next = authenticationValues.pop();
                      if (Array.isArray(next)) {
                        authenticationValues.push(...next);
                      } else if (next !== null && typeof next === 'object') {
                        for (const [key, child] of Object.entries(next)) {
                          authenticationKeys.add(key);
                          authenticationValues.push(child);
                        }
                      }
                    }
                    const authenticationDigest = yield* Effect.tryPromise({
                      try: () =>
                        crypto.subtle.digest(
                          'SHA-256',
                          new TextEncoder().encode(
                            JSON.stringify(
                              value,
                              [...authenticationKeys].sort(),
                            ),
                          ),
                        ),
                      catch: ZerospinError.catch({
                        code: 'authentication-hash-failed',
                        message: 'Could not hash authentication',
                      }),
                    });
                    return [...new Uint8Array(authenticationDigest)]
                      .map(byte => byte.toString(16).padStart(2, '0'))
                      .join('');
                  });

                const attachLiveSocket = (currentSocket: WebSocket) => {
                  currentSocket.onmessage = (event: MessageEvent) => {
                    void Effect.runPromiseWith(context)(
                      Effect.gen(function* () {
                        if (period.revoked || socket !== currentSocket) return;
                        const message = yield* Effect.try({
                          try: () => JSON.parse(String(event.data)),
                          catch: ZerospinError.catch({
                            code: 'service-frontend-selected-message-invalid',
                          }),
                        });
                        if (message.type !== 'serviceSelectedCommand') return;
                        const command = yield* Schema.decodeUnknownEffect(
                          ServiceSelectedCommandSchema,
                        )(message.command).pipe(
                          Effect.mapError(
                            () =>
                              new ZerospinError({
                                code: 'service-frontend-selected-message-invalid',
                              }),
                          ),
                        );
                        if (period.revoked || socket !== currentSocket) return;
                        const applied = yield* applyServiceSelectedCommand({
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
                            serviceHash: nextMetadata.serviceHash,
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
                };

                const resumeFromCheckpoint = (checkpoint: {
                  serviceIndex: number;
                  serviceHash: string;
                  serviceVersion: string;
                }) =>
                  Effect.gen(function* () {
                    const bufferedSelectedCommands: IServiceSelectedCommand[] =
                      [];
                    const ticket = yield* createServiceFrontendWebSocketTicket({
                      serviceVersion: props.serviceVersion,
                      apiUrl,
                      publishableKey,
                      systemName,
                      generateSignature,
                      serviceName: frontend.serviceName,
                      frontendName: frontend.name,
                      serviceFrontendLock,
                    });
                    const replayComplete = Promise.withResolvers<
                      number | 'state-required'
                    >();
                    const opened = Promise.withResolvers<void>();
                    void opened.promise.catch(() => undefined);
                    void replayComplete.promise.catch(() => undefined);
                    let settled = false;
                    socket = yield* Effect.try({
                      try: () => {
                        const url = new URL(apiUrl);
                        url.protocol =
                          url.protocol === 'https:' ? 'wss:' : 'ws:';
                        url.pathname = '/ws-service-frontend-commands';
                        url.search = '';
                        url.searchParams.set('ticket', ticket.ticket);
                        const nextSocket = new WebSocket(url);
                        nextSocket.onopen = () => {
                          nextSocket.send(
                            JSON.stringify({
                              serviceIndex: checkpoint.serviceIndex,
                              serviceHash: checkpoint.serviceHash,
                            }),
                          );
                          opened.resolve();
                        };
                        nextSocket.onerror = () =>
                          opened.reject(new Error('WebSocket open failed'));
                        nextSocket.onclose = () => {
                          if (settled) return;
                          const failure = new Error(
                            'WebSocket closed before selected-command replay completed',
                          );
                          opened.reject(failure);
                          replayComplete.reject(failure);
                        };
                        nextSocket.onmessage = event => {
                          try {
                            const message = JSON.parse(String(event.data));
                            if (message.type === 'serviceSelectedCommand') {
                              bufferedSelectedCommands.push(message.command);
                            } else if (message.type === 'replay-complete') {
                              settled = true;
                              replayComplete.resolve(message.serviceIndex);
                            } else if (message.type === 'state-required') {
                              settled = true;
                              replayComplete.resolve('state-required');
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
                        code: 'service-frontend-selected-replay-failed',
                      }),
                    });
                    if (replayTip === 'state-required') {
                      socket?.close(1000, 'state-required');
                      socket = null;
                      return { type: 'state-required' } satisfies Readonly<{
                        type: 'state-required';
                      }>;
                    }
                    const decodedSelectedCommands = [];
                    for (const command of bufferedSelectedCommands) {
                      decodedSelectedCommands.push(
                        yield* Schema.decodeUnknownEffect(
                          ServiceSelectedCommandSchema,
                        )(command).pipe(
                          Effect.mapError(
                            () =>
                              new ZerospinError({
                                code: 'service-frontend-selected-message-invalid',
                              }),
                          ),
                        ),
                      );
                    }
                    decodedSelectedCommands.sort(
                      (left, right) => left.serviceIndex - right.serviceIndex,
                    );
                    if (
                      !Number.isSafeInteger(replayTip) ||
                      replayTip < checkpoint.serviceIndex ||
                      decodedSelectedCommands.filter(
                        command => command.serviceIndex <= replayTip,
                      ).length !==
                        replayTip - checkpoint.serviceIndex ||
                      decodedSelectedCommands.some(
                        (command, index) =>
                          command.serviceIndex !==
                          checkpoint.serviceIndex + index + 1,
                      )
                    ) {
                      return yield* new ZerospinError({
                        code: 'service-frontend-selected-replay-invalid',
                        message:
                          'Service selected-command socket replay was incomplete or non-contiguous',
                      });
                    }
                    return {
                      type: 'replayed',
                      tip: replayTip,
                      commands: decodedSelectedCommands,
                      resumeServiceIndex: checkpoint.serviceIndex,
                    } satisfies Readonly<{
                      type: 'replayed';
                      tip: number;
                      commands: readonly IServiceSelectedCommand[];
                      resumeServiceIndex: number;
                    }>;
                  });

                const replaceAuthoritativeDatabase = Effect.gen(function* () {
                  const wasCurrent =
                    session.store.getState().sessionStatus === 'current';
                  if (wasCurrent) {
                    session.store.setState({ sessionStatus: 'bootstrapping' });
                  }
                  backupAccepting = false;
                  db.$client.onCommittedTransaction = null;
                  while (Queue.sizeUnsafe(transactionQueue) > 0) {
                    yield* Queue.take(transactionQueue);
                  }
                  yield* Effect.try({
                    try: () => restoreLiveDatabase(emptyDatabase),
                    catch: ZerospinError.catch({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Failed to clear the service frontend database for state replacement',
                    }),
                  });
                  db.run(
                    sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL, authentication TEXT)`,
                  );
                  db.run(
                    sql`INSERT INTO __zerospin_backup_identity (backupKey, authentication) VALUES (${backupKey}, ${JSON.stringify(authentication)})`,
                  );
                  const recoverySnapshot = yield* fetchServiceFrontendSnapshot({
                    serviceVersion: props.serviceVersion,
                    apiUrl,
                    publishableKey,
                    systemName,
                    generateSignature,
                    serviceName: frontend.serviceName,
                    frontendName: frontend.name,
                    serviceFrontendLock,
                  });
                  const recoveredAuthentication = yield* Schema.encodeEffect(
                    frontend.authentication.authenticationSchema,
                  )(recoverySnapshot.authentication).pipe(
                    mapParseError({
                      code: 'frontend-authentication-invalid',
                      prefix: 'Invalid recovered authentication',
                    }),
                  );
                  const recoveredHash = yield* hashAuthentication(
                    recoveredAuthentication,
                  );
                  if (recoveredHash !== authenticationHash) {
                    return yield* new ZerospinError({
                      code: 'frontend-session-authentication-mismatch',
                      message:
                        'Current authentication belongs to a different backup',
                    });
                  }
                  authentication = recoveredAuthentication;
                  db.run(
                    sql`UPDATE __zerospin_backup_identity SET authentication = ${JSON.stringify(authentication)}`,
                  );
                  backupAccepting = true;
                  db.$client.onCommittedTransaction = statements => {
                    if (backupAccepting && !period.revoked) {
                      session.store.setState({
                        backupState: { status: 'pending', failure: null },
                      });
                      Queue.offerUnsafe(transactionQueue, statements);
                    }
                  };
                  yield* applyServiceFrontendSnapshot({
                    frontend,
                    sessionId: executionSessionId,
                    authentication,
                    db,
                    models,
                    snapshot: recoverySnapshot,
                  });
                  const replacementSnapshot = db.$client.sqlite3.serialize(
                    db.$client.db,
                    'main',
                  );
                  yield* backupDb
                    .overwriteDb({ snapshot: replacementSnapshot })
                    .pipe(
                      Effect.retry({
                        times: 1,
                        while: error =>
                          error.code === 'backup-request-uncertain' &&
                          !period.revoked,
                      }),
                    );
                  while (Queue.sizeUnsafe(transactionQueue) > 0) {
                    yield* Queue.take(transactionQueue);
                  }
                  const replacedMetadata = db
                    .select()
                    .from(serviceSessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        serviceSessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (replacedMetadata === undefined) {
                    return yield* new ZerospinError({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Replacement service frontend metadata is missing',
                    });
                  }
                  if (wasCurrent) {
                    session.store.setState({
                      serviceIndex: replacedMetadata.serviceIndex,
                      serviceHash: replacedMetadata.serviceHash,
                      serviceVersion: replacedMetadata.serviceVersion,
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
                  }
                  return {
                    serviceIndex: replacedMetadata.serviceIndex,
                    serviceHash: replacedMetadata.serviceHash,
                    serviceVersion: replacedMetadata.serviceVersion,
                  };
                });

                let localMetadata = db
                  .select()
                  .from(serviceSessionMetadataDrizzleSchema)
                  .where(
                    eq(
                      serviceSessionMetadataDrizzleSchema.sessionId,
                      executionSessionId,
                    ),
                  )
                  .get();
                if (localMetadata === undefined) {
                  yield* replaceAuthoritativeDatabase;
                  localMetadata = db
                    .select()
                    .from(serviceSessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        serviceSessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (localMetadata === undefined) {
                    return yield* new ZerospinError({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Replacement service frontend metadata is missing',
                    });
                  }
                }

                let resume = yield* resumeFromCheckpoint({
                  serviceIndex: localMetadata.serviceIndex,
                  serviceHash: localMetadata.serviceHash,
                  serviceVersion: localMetadata.serviceVersion,
                });
                if (resume.type === 'state-required') {
                  const replaced = yield* replaceAuthoritativeDatabase;
                  resume = yield* resumeFromCheckpoint(replaced);
                  if (resume.type === 'state-required') {
                    return yield* new ZerospinError({
                      code: 'service-frontend-state-required',
                      message:
                        'Authoritative replacement still failed history validation',
                    });
                  }
                }
                if (period.revoked) {
                  return yield* new ZerospinError({
                    code: 'backup-db-revoked',
                  });
                }
                for (const command of resume.commands) {
                  if (command.serviceIndex <= resume.resumeServiceIndex) {
                    continue;
                  }
                  yield* applyServiceSelectedCommand({
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
                attachLiveSocket(currentSocket);
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
            // Cold-start replacement already persisted via overwriteDb; restored
            // baselines only need the sessionId renewal statements drained here.
            while (Queue.sizeUnsafe(transactionQueue) > 0) {
              const statements = yield* Queue.take(transactionQueue);
              yield* backupDb
                .applyStatements({ statements })
                .pipe(
                  Effect.catch(error =>
                    error.code === 'backup-request-uncertain' && !period.revoked
                      ? repairBackup
                      : Effect.fail(error),
                  ),
                );
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
            if (authentication === null) {
              return yield* new ZerospinError({
                code: 'frontend-authentication-required',
                message: 'A frontend session requires validated authentication',
              });
            }
            hasOwned = true;
            session.store.setState({
              sessionId: executionSessionId,
              serviceName: frontend.serviceName,
              authentication: Schema.decodeUnknownSync(
                frontend.authentication.authenticationSchema,
              )(authentication),
              frontendName: frontend.name,
              serviceFrontendLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              serviceIndex: metadata.serviceIndex,
              serviceHash: metadata.serviceHash,
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
                      serviceHash: recoveredMetadata.serviceHash,
                      serviceVersion: recoveredMetadata.serviceVersion,
                    });
                  }
                  yield* Effect.try({
                    try: () =>
                      localStorage.setItem(
                        authenticationLocatorKey,
                        JSON.stringify({ authenticationHash }),
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

            if (online) {
              yield* Effect.try({
                try: () =>
                  localStorage.setItem(
                    authenticationLocatorKey,
                    JSON.stringify({ authenticationHash }),
                  ),
                catch: ZerospinError.catch({
                  code: 'browser-persistence-reset-required',
                  message: 'Failed to retain the frontend offline locator',
                }),
              });
            }
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
  if (authentication === null) {
    return yield* new ZerospinError({
      code: 'frontend-authentication-required',
      message: 'Authentication was not initialized',
    });
  }
  return {
    authentication: yield* Schema.decodeUnknownEffect(
      frontend.authentication.authenticationSchema,
    )(authentication).pipe(
      mapParseError({
        code: 'frontend-authentication-invalid',
        prefix: 'Invalid persisted authentication',
      }),
    ),
  };
});
