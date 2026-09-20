import type { IBackupWorker } from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type { IAggregateFrontendController } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import {
  AggregateSelectedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { applyAggregateFrontendSnapshot } from '@zerospin/core/session/applyAggregateFrontendSnapshot';
import { applyAggregateSelectedCommand } from '@zerospin/core/session/applyAggregateSelectedCommand';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '@zerospin/core/session/sessionRepoTables';
import type {
  IAggregateSelectedCommand,
  IAggregateSession,
} from '@zerospin/core/session/types';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { TelemetryCollector } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq, getTableName, isNull, sql } from 'drizzle-orm';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
} from 'effect';

import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket.ts';
import { fetchAggregateFrontendSnapshot } from './fetchAggregateFrontendSnapshot.ts';
import { frontendPushRetrySchedule } from './frontendPushRetrySchedule.ts';
import { makeAggregateFrontendBackupKey } from './makeAggregateFrontendBackupKey.ts';

/*
 * 1. Retain one synchronous live database and mounted store for this frontend.
 * 2. Scope database release to the Provider.
 * 3. Resolve authenticated identity, retaining the offline authentication locator.
 * 4. Acquire on visibility/focus/restoration and pause revoked ownership in place.
 * 5. Restore committed SQLite before establishing a fresh execution identity.
 * 6. Serialize incremental backup delivery and repair uncertain mutations with a snapshot.
 * 7. Publish the current period and run its scoped socket, reconciliation, and push work.
 */
export const bootstrapAggregateFrontendSession = Effect.fn(
  'bootstrapAggregateFrontendSession',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  aggregateVersion: string;
  session: IAggregateSession<FRONTEND>;
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
    aggregateFrontendLockKey: string;
    executeAggregateFrontendCommand(props: {
      command: IEncodedCommand<
        IChainedCommand<
          ISessionCommand,
          NonNullable<Schema.Schema.Type<typeof SessionCommandSchema>['delta']>
        > &
          Readonly<{ sessionIndex: number; pushIndex: null }>
      >;
    }): Effect.Effect<Readonly<{ commandId: string }>, IAnyError>;
    getPushPaused: Effect.Effect<boolean>;
    setPushPaused(props: {
      pushPaused: boolean;
    }): Effect.Effect<void, IAnyError>;
    pushNow: Effect.Effect<
      | Readonly<{ status: 'empty' }>
      | Readonly<{ status: 'pushed' }>
      | Readonly<{ status: 'retry-exhausted'; failure: IAnyErrorJson }>,
      IAnyError
    >;
  }>,
  IAnyError,
  Async | Scope.Scope | TelemetryCollector
> {
  const { apiUrl, generateSignature, publishableKey, systemName } = props;
  // 1 — Build the lock-keyed schema and in-memory SQLite database before
  // exposing any session state or accepting backup transactions.
  const { session } = props;
  const frontend = session.frontend;
  const context = yield* Effect.context<Async | TelemetryCollector>();
  const aggregateFrontendLock =
    makeFrontendControllerSpec(frontend).aggregateFrontendLock;
  const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
    aggregateFrontendLock,
  );
  const models = getFrontendDbModels(frontend);
  const dbConfig = makeResourceDbConfig({
    models,
    otherTables: sessionRepoTables,
  });
  const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
  const emptyDatabase = db.$client.sqlite3.serialize(db.$client.db, 'main');
  const expectedSchema = JSON.stringify(
    db.all<{ type: string; name: string; sql: string }>(
      sql`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`,
    ),
  );
  let released = false;
  // Manual pause stops new sends; the retained live socket owns admission.
  let pushPaused = false;
  let liveSocket: WebSocket | null = null;
  const transientCodes = new Set([
    'async-failed',
    'user-authentication-transport-failed',
    'gateway-infrastructure-failure',
    'system-deploy-activating',
    'system-deploy-failed',
    'system-not-ready',
    'aggregate-frontend-websocket-open-failed',
    'aggregate-frontend-selected-replay-failed',
  ]);

  session.store.setState({
    sessionStatus: 'bootstrapping',
    backupState: { status: 'pending', failure: null },
  });

  // 2 — Scoped release stops admission, closes the retained socket and database, closes SQLite, and publishes released state.
  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      released = true;
      yield* Effect.try({
        try: () => db.$client.sqlite3.close(db.$client.db),
        catch: ZerospinError.catch({
          code: 'aggregate-frontend-session-database-close-failed',
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
    aggregateName: frontend.aggregateName,
    aggregateVersion: props.aggregateVersion,
    aggregateFrontendLockKey,
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
  let aggregateId: IAggregateId;
  const initial = yield* fetchAggregateFrontendSnapshot({
    pendingCommandIds: [],
    aggregateVersion: props.aggregateVersion,
    aggregateName: frontend.aggregateName,
    aggregateFrontendLock,
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
    aggregateId = initial.success.aggregateId;
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
          aggregateId: makeAbbreviationIdSchema('acct'),
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
    aggregateId = locator.aggregateId;
  }

  // 4 — Visibility signals acquire one revocable capability for this exact key.
  const backupKey = yield* makeAggregateFrontendBackupKey({
    aggregateVersion: props.aggregateVersion,
    aggregateId,
    authenticationHash,
    aggregateName: frontend.aggregateName,
    frontendName: frontend.name,
    aggregateFrontendLockKey,
  });
  const backupWorker = yield* props.claimBackup({ backupKey });
  const acquireSignal = yield* Queue.unbounded<void>();
  const initialized = yield* Deferred.make<void, IAnyError>();
  let hasOwned = false;
  let acquiringPeriod: { revoked: boolean } | null = null;
  let activePeriod: {
    revoked: boolean;
    scope: Scope.Closeable;
    pendingAdmission: {
      commandId: string;
      deferred: Deferred.Deferred<
        Readonly<{ aggregateIndex: number; commandId: string }>,
        IAnyError
      >;
    } | null;
  } | null = null;
  let pushSignal: Queue.Queue<void> | null = null;
  let pushFiber: Fiber.Fiber<unknown, unknown> | null = null;
  let pushLane: Effect.Effect<never, IAnyError> | null = null;
  let pushOne: Effect.Effect<
    | Readonly<{ status: 'empty' }>
    | Readonly<{ status: 'pushed' }>
    | Readonly<{ status: 'retry-exhausted'; failure: IAnyErrorJson }>,
    IAnyError
  > = Effect.fail(
    new ZerospinError({ code: 'aggregate-frontend-session-not-current' }),
  );
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
        const period: {
          revoked: boolean;
          scope: Scope.Closeable;
          pendingAdmission: {
            commandId: string;
            deferred: Deferred.Deferred<
              Readonly<{ aggregateIndex: number; commandId: string }>,
              IAnyError
            >;
          } | null;
        } = {
          revoked: false,
          scope: yield* Scope.make(),
          pendingAdmission: null,
        };
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
            code: 'aggregate-frontend-session-not-ready',
            message: 'Bootstrap requires a bound session id',
          });
        }
        let selectedSnapshot = acquisition.success.snapshot;
        const startupFiber = yield* Effect.forkIn(
          Effect.gen(function* () {
            let socket: WebSocket | null = null;
            let backupAccepting = false;
            const scope = yield* Effect.scope;
            yield* Effect.addFinalizer(() =>
              Effect.gen(function* () {
                period.revoked = true;
                backupAccepting = false;
                if (activePeriod === period) {
                  db.$client.onCommittedTransaction = null;
                }
                if (liveSocket === socket) liveSocket = null;
                if (period.pendingAdmission !== null) {
                  yield* Deferred.fail(
                    period.pendingAdmission.deferred,
                    new ZerospinError({
                      code: 'aggregate-frontend-session-not-current',
                    }),
                  );
                  period.pendingAdmission = null;
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
                      db.select().from(sessionMetadataDrizzleSchema).all()
                        .length !== 1
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
                    'Failed to restore the current aggregate frontend backup',
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
              db.update(sessionMetadataDrizzleSchema)
                .set({ sessionId: executionSessionId, nextSessionIndex: 1 })
                .run();
            }
            // 5 — Resume from the local selection checkpoint. Matching history
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
                liveSocket = null;
                if (period.pendingAdmission !== null) {
                  yield* Deferred.fail(
                    period.pendingAdmission.deferred,
                    new ZerospinError({
                      code: 'aggregate-frontend-websocket-open-failed',
                    }),
                  );
                  period.pendingAdmission = null;
                }
                if (pushFiber !== null) {
                  const pausedFiber = pushFiber;
                  yield* Fiber.interrupt(pausedFiber);
                  if (pushFiber === pausedFiber) {
                    pushFiber = null;
                  }
                }
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
                        const message = yield* Schema.decodeUnknownEffect(
                          Schema.fromJsonString(
                            Schema.Record(Schema.String, Schema.Unknown),
                          ),
                        )(String(event.data)).pipe(
                          Effect.mapError(
                            () =>
                              new ZerospinError({
                                code: 'aggregate-frontend-selected-message-invalid',
                              }),
                          ),
                        );
                        if (message.type === 'aggregateCommandAdmission') {
                          const receipt = yield* Schema.decodeUnknownEffect(
                            Schema.Struct({
                              type: Schema.Literal('aggregateCommandAdmission'),
                              commandId: Schema.String,
                              result: Schema.Union([
                                Schema.Struct({
                                  _tag: Schema.Literal('Success'),
                                  success: Schema.Struct({
                                    aggregateIndex: Schema.Number.check(
                                      Schema.isInt(),
                                      Schema.isGreaterThanOrEqualTo(1),
                                    ),
                                    commandId: Schema.String,
                                  }),
                                }),
                                Schema.Struct({
                                  _tag: Schema.Literal('Failure'),
                                  failure: Schema.toEncoded(
                                    ZerospinError.schema,
                                  ),
                                }),
                              ]),
                              link: Schema.optional(
                                Schema.NullOr(
                                  Schema.Struct({
                                    linkId: Schema.TemplateLiteral([
                                      'lnk_',
                                      Schema.String,
                                    ]),
                                    traceId: Schema.TemplateLiteral([
                                      'trc_',
                                      Schema.String,
                                    ]),
                                    spanId: Schema.TemplateLiteral([
                                      'spn_',
                                      Schema.String,
                                    ]),
                                    priorTraceId: Schema.TemplateLiteral([
                                      'trc_',
                                      Schema.String,
                                    ]),
                                    priorSpanId: Schema.TemplateLiteral([
                                      'spn_',
                                      Schema.String,
                                    ]),
                                    kind: Schema.Literals([
                                      'causedBy',
                                      'retryOf',
                                    ]),
                                  }),
                                ),
                              ),
                            }),
                          )(message, { onExcessProperty: 'error' }).pipe(
                            Effect.mapError(
                              () =>
                                new ZerospinError({
                                  code: 'aggregate-admission-receipt-invalid',
                                }),
                            ),
                          );
                          const pending = period.pendingAdmission;
                          if (
                            pending === null ||
                            receipt.commandId !== pending.commandId ||
                            (receipt.result._tag === 'Success' &&
                              receipt.result.success.commandId !==
                                pending.commandId)
                          ) {
                            return yield* new ZerospinError({
                              code: 'aggregate-admission-receipt-conflict',
                            });
                          }
                          const collector =
                            yield* Effect.serviceOption(TelemetryCollector);
                          if (
                            receipt.link != null &&
                            Option.isSome(collector)
                          ) {
                            collector.value.addLinks([receipt.link]);
                          }
                          period.pendingAdmission = null;
                          if (receipt.result._tag === 'Failure') {
                            yield* Deferred.fail(
                              pending.deferred,
                              new ZerospinError(receipt.result.failure),
                            );
                          } else {
                            yield* Deferred.succeed(
                              pending.deferred,
                              receipt.result.success,
                            );
                          }
                          return;
                        }
                        if (message.type !== 'aggregateSelectedCommand') {
                          return yield* new ZerospinError({
                            code: 'aggregate-frontend-selected-message-invalid',
                          });
                        }
                        const selected = yield* Schema.decodeUnknownEffect(
                          Schema.Struct({
                            type: Schema.Literal('aggregateSelectedCommand'),
                            command: AggregateSelectedCommandSchema,
                          }),
                        )(message, { onExcessProperty: 'error' }).pipe(
                          Effect.mapError(
                            () =>
                              new ZerospinError({
                                code: 'aggregate-frontend-selected-message-invalid',
                              }),
                          ),
                        );
                        if (period.revoked || socket !== currentSocket) return;
                        if (authentication === null) {
                          return yield* new ZerospinError({
                            code: 'frontend-authentication-required',
                          });
                        }
                        const applied = yield* applyAggregateSelectedCommand({
                          db,
                          frontend,
                          sessionId: executionSessionId,
                          models,
                          command: selected.command,
                        });
                        if (
                          period.revoked ||
                          socket !== currentSocket ||
                          applied === 'duplicate'
                        ) {
                          return;
                        }
                        const state = session.store.getState();
                        if (state.isInitialized) {
                          const nextMetadata = db
                            .select()
                            .from(sessionMetadataDrizzleSchema)
                            .where(
                              eq(
                                sessionMetadataDrizzleSchema.sessionId,
                                executionSessionId,
                              ),
                            )
                            .get();
                          if (nextMetadata !== undefined) {
                            session.store.setState({
                              aggregateIndex: nextMetadata.aggregateIndex,
                              selectionIndex: nextMetadata.selectionIndex,
                              selectionHash: nextMetadata.selectionHash,
                              pushIndex: nextMetadata.pushIndex,
                            });
                          }
                        }
                      }).pipe(
                        Effect.catch(error =>
                          Effect.sync(() => {
                            const failure = Schema.encodeSync(
                              ZerospinError.schema,
                            )(error);
                            if (!period.revoked && socket === currentSocket) {
                              liveSocket = null;
                              online = false;
                            }
                            currentSocket.close(4003, failure.code);
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
                      liveSocket = null;
                      if (period.pendingAdmission !== null) {
                        Effect.runFork(
                          Deferred.fail(
                            period.pendingAdmission.deferred,
                            new ZerospinError({
                              code: 'aggregate-frontend-websocket-open-failed',
                            }),
                          ),
                        );
                        period.pendingAdmission = null;
                      }
                      if (pushFiber !== null) {
                        Effect.runFork(Fiber.interrupt(pushFiber));
                        pushFiber = null;
                      }
                      online = false;
                      if (
                        session.store.getState().sessionStatus === 'current'
                      ) {
                        Queue.offerUnsafe(reconnectSignal, undefined);
                      }
                    }
                  };
                };

                const resumeFromCheckpoint = (checkpoint: {
                  selectionIndex: number;
                  selectionHash: string;
                }) =>
                  Effect.gen(function* () {
                    const bufferedSelectedCommands: IAggregateSelectedCommand[] =
                      [];
                    const ticket =
                      yield* createAggregateFrontendWebSocketTicket({
                        aggregateVersion: props.aggregateVersion,
                        apiUrl,
                        publishableKey,
                        systemName,
                        generateSignature,
                        aggregateName: frontend.aggregateName,
                        frontendName: frontend.name,
                        aggregateFrontendLock,
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
                        url.pathname = '/ws-aggregate-frontend-commands';
                        url.search = '';
                        url.searchParams.set('ticket', ticket.ticket);
                        const nextSocket = new WebSocket(url);
                        nextSocket.onopen = () => {
                          nextSocket.send(JSON.stringify(checkpoint));
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
                            if (message.type === 'aggregateSelectedCommand') {
                              bufferedSelectedCommands.push(message.command);
                            } else if (message.type === 'replay-complete') {
                              settled = true;
                              replayComplete.resolve(message.selectionIndex);
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
                        code: 'aggregate-frontend-websocket-open-failed',
                        message:
                          'Could not connect to the aggregate frontend command stream',
                        preferCauseMessage: false,
                      }),
                    });
                    yield* Effect.tryPromise({
                      try: () => opened.promise,
                      catch: ZerospinError.catch({
                        code: 'aggregate-frontend-websocket-open-failed',
                        message:
                          'Could not connect to the aggregate frontend command stream',
                        preferCauseMessage: false,
                      }),
                    });
                    const replayTip = yield* Effect.tryPromise({
                      try: () => replayComplete.promise,
                      catch: ZerospinError.catch({
                        code: 'aggregate-frontend-selected-replay-failed',
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
                          AggregateSelectedCommandSchema,
                        )(command).pipe(
                          Effect.mapError(
                            () =>
                              new ZerospinError({
                                code: 'aggregate-frontend-selected-message-invalid',
                              }),
                          ),
                        ),
                      );
                    }
                    decodedSelectedCommands.sort(
                      (left, right) =>
                        left.selectionIndex - right.selectionIndex,
                    );
                    let bufferedThroughSelectionIndex =
                      checkpoint.selectionIndex;
                    for (const command of decodedSelectedCommands) {
                      if (
                        command.selectionIndex <= bufferedThroughSelectionIndex
                      ) {
                        continue;
                      }
                      if (
                        command.selectionIndex !==
                        bufferedThroughSelectionIndex + 1
                      ) {
                        return yield* new ZerospinError({
                          code: 'aggregate-frontend-selected-replay-invalid',
                          message:
                            'Selected-command socket replay was incomplete or non-contiguous',
                        });
                      }
                      bufferedThroughSelectionIndex = command.selectionIndex;
                    }
                    if (
                      !Number.isSafeInteger(replayTip) ||
                      replayTip < checkpoint.selectionIndex ||
                      bufferedThroughSelectionIndex < replayTip
                    ) {
                      return yield* new ZerospinError({
                        code: 'aggregate-frontend-selected-replay-invalid',
                        message:
                          'Selected-command socket replay was incomplete or non-contiguous',
                      });
                    }
                    return {
                      type: 'replayed',
                      tip: replayTip,
                      commands: decodedSelectedCommands,
                      resumeSelectionIndex: checkpoint.selectionIndex,
                    } satisfies Readonly<{
                      type: 'replayed';
                      tip: number;
                      commands: readonly IAggregateSelectedCommand[];
                      resumeSelectionIndex: number;
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
                        'Failed to clear the aggregate frontend database for state replacement',
                    }),
                  });
                  db.run(
                    sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL, authentication TEXT)`,
                  );
                  db.run(
                    sql`INSERT INTO __zerospin_backup_identity (backupKey, authentication) VALUES (${backupKey}, ${JSON.stringify(authentication)})`,
                  );
                  const recoverySnapshot =
                    yield* fetchAggregateFrontendSnapshot({
                      pendingCommandIds: db
                        .select({
                          commandId:
                            sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                        })
                        .from(sessionOptimisticAppliedMutationDrizzleSchema)
                        .all()
                        .map(row => row.commandId),
                      aggregateVersion: props.aggregateVersion,
                      apiUrl,
                      publishableKey,
                      systemName,
                      generateSignature,
                      aggregateName: frontend.aggregateName,
                      frontendName: frontend.name,
                      aggregateFrontendLock,
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
                  if (
                    recoveredHash !== authenticationHash ||
                    recoverySnapshot.aggregateId !== aggregateId
                  ) {
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
                  yield* applyAggregateFrontendSnapshot({
                    db,
                    frontend,
                    sessionId: executionSessionId,
                    models,
                    snapshot: recoverySnapshot,
                    aggregateId,
                    authentication,
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
                    .from(sessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        sessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (replacedMetadata === undefined) {
                    return yield* new ZerospinError({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Replacement aggregate frontend metadata is missing',
                    });
                  }
                  if (wasCurrent) {
                    session.store.setState({
                      aggregateIndex: replacedMetadata.aggregateIndex,
                      selectionIndex: replacedMetadata.selectionIndex,
                      selectionHash: replacedMetadata.selectionHash,
                      pushIndex: replacedMetadata.pushIndex,
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
                    selectionIndex: replacedMetadata.selectionIndex,
                    selectionHash: replacedMetadata.selectionHash,
                  };
                });

                const applyResumedCommands = (props: {
                  resumeSelectionIndex: number;
                  commands: readonly IAggregateSelectedCommand[];
                }) =>
                  Effect.gen(function* () {
                    if (period.revoked) {
                      return yield* new ZerospinError({
                        code: 'backup-db-revoked',
                      });
                    }
                    if (authentication === null) {
                      return yield* new ZerospinError({
                        code: 'frontend-authentication-required',
                      });
                    }
                    for (const command of props.commands) {
                      if (
                        command.selectionIndex <= props.resumeSelectionIndex
                      ) {
                        continue;
                      }
                      yield* applyAggregateSelectedCommand({
                        db,
                        frontend,
                        sessionId: executionSessionId,
                        models,
                        command,
                      });
                    }
                  });

                let localMetadata = db
                  .select()
                  .from(sessionMetadataDrizzleSchema)
                  .where(
                    eq(
                      sessionMetadataDrizzleSchema.sessionId,
                      executionSessionId,
                    ),
                  )
                  .get();
                if (localMetadata === undefined) {
                  yield* replaceAuthoritativeDatabase;
                  localMetadata = db
                    .select()
                    .from(sessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        sessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (localMetadata === undefined) {
                    return yield* new ZerospinError({
                      code: 'browser-persistence-reset-required',
                      message:
                        'Replacement aggregate frontend metadata is missing',
                    });
                  }
                }

                let resume = yield* resumeFromCheckpoint({
                  selectionIndex: localMetadata.selectionIndex,
                  selectionHash: localMetadata.selectionHash,
                });
                if (resume.type === 'state-required') {
                  const replaced = yield* replaceAuthoritativeDatabase;
                  resume = yield* resumeFromCheckpoint(replaced);
                  if (resume.type === 'state-required') {
                    return yield* new ZerospinError({
                      code: 'aggregate-frontend-state-required',
                      message:
                        'Authoritative replacement still failed history validation',
                    });
                  }
                }
                yield* applyResumedCommands({
                  resumeSelectionIndex: resume.resumeSelectionIndex,
                  commands: resume.commands,
                });
                const currentSocket = yield* Effect.sync(() => socket);
                if (currentSocket === null || currentSocket.readyState !== 1) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-websocket-open-failed',
                    message:
                      'The aggregate frontend WebSocket was not retained',
                  });
                }
                attachLiveSocket(currentSocket);
                online = true;
                liveSocket = currentSocket;
                if (
                  !pushPaused &&
                  pushLane !== null &&
                  pushSignal !== null &&
                  session.store.getState().sessionStatus === 'current'
                ) {
                  if (pushFiber === null) {
                    pushFiber = yield* Effect.forkIn(pushLane, scope);
                  }
                  Queue.offerUnsafe(pushSignal, undefined);
                }
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
              .from(sessionMetadataDrizzleSchema)
              .where(
                eq(sessionMetadataDrizzleSchema.sessionId, executionSessionId),
              )
              .get();
            if (metadata === undefined) {
              return yield* new ZerospinError({
                code: 'browser-persistence-reset-required',
                message: 'The restored aggregate frontend metadata is missing',
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
            // 8 — The serialized push lane selects the oldest unpushed journal command,
            // retries transient failures, and applies the returned terminal occurrence.
            const periodPushSignal = yield* Queue.unbounded<void>();
            pushSignal = periodPushSignal;
            const pushSemaphore = yield* Semaphore.make(1);
            const periodPushOne = pushSemaphore.withPermits(1)(
              Effect.gen(function* () {
                if (
                  period.revoked ||
                  liveSocket === null ||
                  liveSocket !== socket ||
                  liveSocket.readyState !== 1 ||
                  session.store.getState().sessionStatus !== 'current'
                ) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-session-not-current',
                  });
                }
                // Journal insertion order spans execution periods; sessionIndex restarts on reacquisition.
                const row = db
                  .select()
                  .from(sessionCommandJournalDrizzleSchema)
                  .where(isNull(sessionCommandJournalDrizzleSchema.pushIndex))
                  .orderBy(sql`rowid`)
                  .all()
                  .find(row => row.sessionIndex !== null);
                if (row === undefined) {
                  return { status: 'empty' } satisfies Readonly<{
                    status: 'empty';
                  }>;
                }
                const command = yield* Schema.decodeEffect(
                  Schema.fromJsonString(Schema.toEncoded(SessionCommandSchema)),
                )(row.command).pipe(
                  Effect.mapError(
                    () =>
                      new ZerospinError({
                        code: 'aggregate-frontend-local-command-invalid',
                        message: 'The next local command is invalid',
                      }),
                  ),
                  Effect.flatMap(command =>
                    command.pushIndex !== null
                      ? Effect.fail(
                          new ZerospinError({
                            code: 'aggregate-frontend-local-command-invalid',
                            message: 'The next local command is not pushable',
                          }),
                        )
                      : Effect.succeed(command),
                  ),
                );
                const pushed = yield* Effect.gen(function* () {
                  const currentSocket = liveSocket;
                  if (
                    currentSocket === null ||
                    currentSocket !== socket ||
                    currentSocket.readyState !== 1 ||
                    period.revoked
                  ) {
                    return yield* new ZerospinError({
                      code: 'aggregate-frontend-session-not-current',
                    });
                  }
                  const traceContext = yield* Effect.currentSpan.pipe(
                    Effect.flatMap(span =>
                      Schema.decodeUnknownEffect(
                        Schema.Struct({
                          traceId: Schema.TemplateLiteral([
                            'trc_',
                            Schema.String,
                          ]),
                          parentSpanId: Schema.TemplateLiteral([
                            'spn_',
                            Schema.String,
                          ]),
                        }),
                      )({ traceId: span.traceId, parentSpanId: span.spanId }),
                    ),
                    Effect.orElseSucceed(() => null),
                  );
                  const deferred = yield* Deferred.make<
                    Readonly<{ aggregateIndex: number; commandId: string }>,
                    IAnyError
                  >();
                  period.pendingAdmission = { commandId: command.id, deferred };
                  return yield* Effect.try({
                    try: () =>
                      currentSocket.send(
                        JSON.stringify({
                          type: 'pushAggregateCommand',
                          command,
                          traceContext,
                        }),
                      ),
                    catch: ZerospinError.catch({
                      code: 'aggregate-frontend-websocket-open-failed',
                    }),
                  }).pipe(
                    Effect.andThen(Deferred.await(deferred)),
                    Effect.ensuring(
                      Effect.sync(() => {
                        if (period.pendingAdmission?.deferred === deferred) {
                          period.pendingAdmission = null;
                          if (liveSocket === currentSocket) liveSocket = null;
                          currentSocket.close(
                            1012,
                            'aggregate-admission-interrupted',
                          );
                        }
                      }),
                    ),
                  );
                }).pipe(
                  Effect.retry({
                    schedule: frontendPushRetrySchedule,
                    while: error =>
                      transientCodes.has(error.code) &&
                      liveSocket?.readyState === 1 &&
                      !pushPaused &&
                      !released &&
                      !period.revoked,
                  }),
                  Effect.result,
                );
                if (period.revoked) {
                  return yield* new ZerospinError({
                    code: 'backup-db-revoked',
                  });
                }
                if (Result.isFailure(pushed)) {
                  return {
                    status: 'retry-exhausted',
                    failure: Schema.encodeSync(ZerospinError.schema)(
                      pushed.failure,
                    ),
                  } satisfies Readonly<{
                    status: 'retry-exhausted';
                    failure: IAnyErrorJson;
                  }>;
                }
                if (pushed.success.commandId !== command.id) {
                  return yield* new ZerospinError({
                    code: 'aggregate-admission-receipt-conflict',
                    message: 'Admission receipt names another command',
                  });
                }
                // Admission stops resubmission but keeps optimism until its selected completion.
                db.update(sessionCommandJournalDrizzleSchema)
                  .set({ pushIndex: pushed.success.aggregateIndex })
                  .where(eq(sessionCommandJournalDrizzleSchema.id, command.id))
                  .run();
                const nextMetadata = db
                  .select()
                  .from(sessionMetadataDrizzleSchema)
                  .where(
                    eq(
                      sessionMetadataDrizzleSchema.sessionId,
                      executionSessionId,
                    ),
                  )
                  .get();
                if (nextMetadata !== undefined) {
                  session.store.setState({ pushIndex: nextMetadata.pushIndex });
                }
                return { status: 'pushed' } satisfies Readonly<{
                  status: 'pushed';
                }>;
              }),
            );

            const periodPushLane = Effect.forever(
              Effect.gen(function* () {
                yield* Queue.take(periodPushSignal);
                while (
                  liveSocket?.readyState === 1 &&
                  !pushPaused &&
                  !released &&
                  !period.revoked
                ) {
                  const result = yield* periodPushOne;
                  if (result.status !== 'pushed') break;
                }
              }),
            ).pipe(Effect.provide(context));
            pushOne = periodPushOne.pipe(Effect.provide(context));
            pushLane = periodPushLane;
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
              aggregateId,
              aggregateName: frontend.aggregateName,
              authentication: Schema.decodeUnknownSync(
                frontend.authentication.authenticationSchema,
              )(authentication),
              frontendName: frontend.name,
              aggregateFrontendLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              aggregateIndex: metadata.aggregateIndex,
              selectionIndex: metadata.selectionIndex,
              selectionHash: metadata.selectionHash,
              pushIndex: metadata.pushIndex,
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
            pushFiber = yield* Effect.forkIn(periodPushLane, scope);
            if (liveSocket?.readyState === 1 && !pushPaused) {
              Queue.offerUnsafe(periodPushSignal, undefined);
            }

            // 9 — Browser-online and socket-close signals share serialized recovery;
            // successful recovery replaces the shared backup baseline before refreshing frontiers.
            const onlineListener = () => {
              if (
                !released &&
                !period.revoked &&
                session.store.getState().sessionStatus === 'current'
              ) {
                Queue.offerUnsafe(reconnectSignal, undefined);
                Queue.offerUnsafe(periodPushSignal, undefined);
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
                    .from(sessionMetadataDrizzleSchema)
                    .where(
                      eq(
                        sessionMetadataDrizzleSchema.sessionId,
                        executionSessionId,
                      ),
                    )
                    .get();
                  if (recoveredMetadata !== undefined) {
                    session.store.setState({
                      aggregateIndex: recoveredMetadata.aggregateIndex,
                      selectionIndex: recoveredMetadata.selectionIndex,
                      selectionHash: recoveredMetadata.selectionHash,
                      pushIndex: recoveredMetadata.pushIndex,
                    });
                  }
                  yield* Effect.try({
                    try: () =>
                      localStorage.setItem(
                        authenticationLocatorKey,
                        JSON.stringify({
                          authenticationHash,
                          aggregateId,
                        }),
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
                    JSON.stringify({
                      authenticationHash,
                      aggregateId,
                    }),
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
  // The controls read the current ownership period each time; mounted callers retain them.
  return {
    authentication: yield* Schema.decodeUnknownEffect(
      frontend.authentication.authenticationSchema,
    )(authentication).pipe(
      mapParseError({
        code: 'frontend-authentication-invalid',
        prefix: 'Invalid persisted authentication',
      }),
    ),
    aggregateFrontendLockKey,
    executeAggregateFrontendCommand: ({ command }) =>
      Effect.gen(function* () {
        if (
          activePeriod === null ||
          activePeriod.revoked ||
          session.store.getState().sessionStatus !== 'current' ||
          pushSignal === null
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-session-not-current',
          });
        }
        Queue.offerUnsafe(pushSignal, undefined);
        return { commandId: command.id };
      }),
    getPushPaused: Effect.sync(() => pushPaused),
    setPushPaused: ({ pushPaused: nextPushPaused }) =>
      Effect.gen(function* () {
        if (
          activePeriod === null ||
          activePeriod.revoked ||
          session.store.getState().sessionStatus !== 'current'
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-session-not-current',
          });
        }
        pushPaused = nextPushPaused;
        if (
          pushPaused &&
          activePeriod.pendingAdmission === null &&
          pushFiber !== null
        ) {
          const pausedFiber = pushFiber;
          yield* Fiber.interrupt(pausedFiber);
          if (pushFiber === pausedFiber) pushFiber = null;
        }
        if (
          !pushPaused &&
          liveSocket?.readyState === 1 &&
          pushLane !== null &&
          pushSignal !== null
        ) {
          if (pushFiber === null) {
            pushFiber = yield* Effect.forkIn(pushLane, activePeriod.scope);
          }
          Queue.offerUnsafe(pushSignal, undefined);
        }
      }),
    pushNow: Effect.suspend(() =>
      activePeriod === null ||
      activePeriod.revoked ||
      session.store.getState().sessionStatus !== 'current' ||
      liveSocket?.readyState !== 1
        ? Effect.fail(
            new ZerospinError({
              code: 'aggregate-frontend-session-not-current',
            }),
          )
        : pushOne,
    ),
  };
});
