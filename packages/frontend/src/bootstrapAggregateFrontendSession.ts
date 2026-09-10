import type { IBackupWorker } from '@zerospin/backup-worker';
import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
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
  AggregateFrontendFinalizedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { applyAggregateFrontendCommand } from '@zerospin/core/session/applyAggregateFrontendCommand';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '@zerospin/core/session/sessionRepoTables';
import type {
  IAggregateFrontendFinalizedCommand,
  IFrontendDelta,
  ISession,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { type TelemetryCollector } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq, getTableName, isNull, sql } from 'drizzle-orm';
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

import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket.ts';
import { fetchAggregateFrontendState } from './fetchAggregateFrontendState.ts';
import { frontendPushRetrySchedule } from './frontendPushRetrySchedule.ts';
import { makeAggregateFrontendBackupKey } from './makeAggregateFrontendBackupKey.ts';
import { pushAggregateFrontendCommand } from './pushAggregateFrontendCommand.ts';

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
  session: ISession<FRONTEND>;
  aggregateId: IAggregateId;
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  backupWorker: IBackupWorker;
}): Effect.fn.Return<
  Readonly<{
    systemId: ISystemId;
    userId: string;
    aggregateFrontendLockKey: string;
    executeAggregateFrontendCommand(props: {
      command: IEncodedCommand<
        IChainedCommand<ISessionCommand, IFrontendDelta> &
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
  const {
    apiUrl,
    authenticationLock,
    generateSignature,
    publishableKey,
    systemName,
  } = props;
  // 1 — Build the lock-keyed schema and in-memory SQLite database before
  // exposing any session state or accepting backup transactions.
  const { aggregateId, backupWorker, session } = props;
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
  let pushPaused = false;
  const transientCodes = new Set([
    'async-failed',
    'user-authentication-transport-failed',
    'gateway-infrastructure-failure',
    'system-deploy-activating',
    'system-deploy-failed',
    'system-not-ready',
    'aggregate-frontend-websocket-open-failed',
    'aggregate-frontend-finalized-replay-failed',
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
    const initialState = yield* fetchAggregateFrontendState({
      outstandingCommandIds: [],
      aggregateVersion: props.aggregateVersion,
      apiUrl,
      publishableKey,
      systemName,
      authenticationLock,
      generateSignature,
      aggregateId,
      aggregateName: frontend.aggregateName,
      frontendName: frontend.name,
      aggregateFrontendLock,
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
  const backupKey = yield* makeAggregateFrontendBackupKey({
    aggregateVersion: props.aggregateVersion,
    systemId,
    userId,
    aggregateId,
    aggregateName: frontend.aggregateName,
    frontendName: frontend.name,
    aggregateFrontendLockKey,
  });
  const acquireSignal = yield* Queue.unbounded<void>();
  const initialized = yield* Deferred.make<void, IAnyError>();
  let hasOwned = false;
  let acquiringPeriod: { revoked: boolean } | null = null;
  let activePeriod: { revoked: boolean; scope: Scope.Closeable } | null = null;
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
            const scope = yield* Effect.scope;
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
              db.update(sessionMetadataDrizzleSchema)
                .set({ sessionId: executionSessionId, nextSessionIndex: 1 })
                .run();
            }
            // 5 — Capture a published snapshot, pin its version in the ticket, and
            // replay strictly after its cursor before retaining the live socket.
            const reconnectSignal = yield* Queue.unbounded<void>();
            const recoverySemaphore = yield* Semaphore.make(1);
            const recoverOnline = recoverySemaphore.withPermits(1)(
              Effect.gen(function* () {
                const bufferedCommands: IAggregateFrontendFinalizedCommand[] =
                  [];
                socket?.close(1000, 'reconnecting');
                socket = null;
                const recoveryState = yield* fetchAggregateFrontendState({
                  outstandingCommandIds: db
                    .select({
                      id: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                    })
                    .from(sessionOptimisticAppliedMutationDrizzleSchema)
                    .all()
                    .map(row => row.id),
                  aggregateVersion: props.aggregateVersion,
                  apiUrl,
                  publishableKey,
                  systemName,
                  authenticationLock,
                  generateSignature,
                  aggregateId,
                  aggregateName: frontend.aggregateName,
                  frontendName: frontend.name,
                  aggregateFrontendLock,
                });
                const ticket = yield* createAggregateFrontendWebSocketTicket({
                  aggregateVersion: props.aggregateVersion,
                  apiUrl,
                  publishableKey,
                  systemName,
                  authenticationLock,
                  generateSignature,
                  aggregateId,

                  aggregateName: frontend.aggregateName,
                  frontendName: frontend.name,
                  aggregateFrontendLock,
                });
                const replayComplete = Promise.withResolvers<number>();
                const opened = Promise.withResolvers<void>();
                // Closing an interrupted setup must not leave an unobserved rejected promise.
                void opened.promise.catch(() => undefined);
                void replayComplete.promise.catch(() => undefined);
                socket = yield* Effect.try({
                  try: () => {
                    const url = new URL(apiUrl);
                    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
                    url.pathname = '/ws-aggregate-frontend-commands';
                    url.search = '';
                    url.searchParams.set('ticket', ticket.ticket);
                    const nextSocket = new WebSocket(url);
                    nextSocket.onopen = () => {
                      nextSocket.send(
                        JSON.stringify({
                          userIndex: recoveryState.userIndex,
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
                        if (message.type === 'aggregateFrontendCommand') {
                          bufferedCommands.push(message.sync);
                        } else if (message.type === 'replay-complete') {
                          replayComplete.resolve(message.userIndex);
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
                    code: 'aggregate-frontend-finalized-replay-failed',
                  }),
                });
                const decodedFinalized = [];
                for (const command of bufferedCommands) {
                  decodedFinalized.push(
                    yield* Schema.decodeUnknownEffect(
                      AggregateFrontendFinalizedCommandSchema,
                    )(command).pipe(
                      Effect.mapError(
                        () =>
                          new ZerospinError({
                            code: 'aggregate-frontend-finalized-message-invalid',
                          }),
                      ),
                    ),
                  );
                }
                decodedFinalized.sort(
                  (left, right) => left.userIndex - right.userIndex,
                );
                let bufferedThroughUserIndex = recoveryState.userIndex;
                for (const command of decodedFinalized) {
                  if (command.userIndex <= bufferedThroughUserIndex) {
                    continue;
                  }
                  if (command.userIndex !== bufferedThroughUserIndex + 1) {
                    return yield* new ZerospinError({
                      code: 'aggregate-frontend-finalized-replay-invalid',
                      message:
                        'Finalized socket replay was incomplete or non-contiguous',
                    });
                  }
                  bufferedThroughUserIndex = command.userIndex;
                }
                if (
                  !Number.isSafeInteger(replayTip) ||
                  replayTip < recoveryState.userIndex ||
                  bufferedThroughUserIndex < replayTip
                ) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-finalized-replay-invalid',
                    message:
                      'Finalized socket replay was incomplete or non-contiguous',
                  });
                }
                if (period.revoked) {
                  return yield* new ZerospinError({
                    code: 'backup-db-revoked',
                  });
                }
                db.$client.onCommittedTransaction = null;
                yield* applyAggregateFrontendState({
                  db,
                  frontend,
                  sessionId: executionSessionId,
                  models,
                  frontendState: recoveryState,
                  aggregateId,
                  userId,
                  systemId,
                });
                for (const command of decodedFinalized) {
                  if (command.userIndex <= recoveryState.userIndex) {
                    continue;
                  }
                  yield* applyAggregateFrontendCommand({
                    db,
                    frontend,
                    sessionId: executionSessionId,
                    models,
                    command,
                    aggregateId,
                    userId,
                  });
                }
                const currentSocket = socket;
                if (currentSocket === null) {
                  return yield* new ZerospinError({
                    code: 'aggregate-frontend-websocket-open-failed',
                    message:
                      'The aggregate frontend WebSocket was not retained',
                  });
                }
                currentSocket.onmessage = (event: MessageEvent) => {
                  void Effect.runPromiseWith(context)(
                    Effect.gen(function* () {
                      if (period.revoked || socket !== currentSocket) return;
                      const message = yield* Effect.try({
                        try: () => JSON.parse(String(event.data)),
                        catch: ZerospinError.catch({
                          code: 'aggregate-frontend-finalized-message-invalid',
                        }),
                      });
                      if (message.type !== 'aggregateFrontendCommand') return;
                      const command = yield* Schema.decodeUnknownEffect(
                        AggregateFrontendFinalizedCommandSchema,
                      )(message.sync).pipe(
                        Effect.mapError(
                          () =>
                            new ZerospinError({
                              code: 'aggregate-frontend-finalized-message-invalid',
                            }),
                        ),
                      );
                      if (period.revoked || socket !== currentSocket) return;
                      const applied = yield* applyAggregateFrontendCommand({
                        db,
                        frontend,
                        sessionId: executionSessionId,
                        models,
                        command,
                        aggregateId,
                        userId,
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
                            userIndex: nextMetadata.userIndex,
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
                            session.store.setState({ sessionStatus: 'failed' });
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
            // 8 — The serialized push lane selects the oldest unpushed journal command,
            // retries transient failures, and applies the returned terminal occurrence.
            const periodPushSignal = yield* Queue.unbounded<void>();
            pushSignal = periodPushSignal;
            const pushSemaphore = yield* Semaphore.make(1);
            const periodPushOne = pushSemaphore.withPermits(1)(
              Effect.gen(function* () {
                if (
                  period.revoked ||
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
                  Schema.fromJsonString(SessionCommandSchema),
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
                const pushed = yield* pushAggregateFrontendCommand({
                  aggregateVersion: props.aggregateVersion,
                  apiUrl,
                  publishableKey,
                  systemName,
                  authenticationLock,
                  generateSignature,
                  aggregateId,
                  aggregateName: frontend.aggregateName,
                  frontendName: frontend.name,
                  aggregateFrontendLock,
                  command,
                }).pipe(
                  Effect.retry({
                    schedule: frontendPushRetrySchedule,
                    while: error =>
                      transientCodes.has(error.code) &&
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
                // Admission stops resubmission but keeps optimism until its terminal resolution.
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
                while (!pushPaused && !released && !period.revoked) {
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
            hasOwned = true;
            session.store.setState({
              sessionId: executionSessionId,
              aggregateId,
              aggregateName: frontend.aggregateName,
              userId,
              systemId,
              frontendName: frontend.name,
              aggregateFrontendLockKey,
              db,
              schema: dbConfig.schema,
              models,
              isInitialized: true,
              aggregateIndex: metadata.aggregateIndex,
              userIndex: metadata.userIndex,
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
            Queue.offerUnsafe(periodPushSignal, undefined);

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
                      userIndex: recoveredMetadata.userIndex,
                      pushIndex: recoveredMetadata.pushIndex,
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
  // The controls read the current ownership period each time; mounted callers retain them.
  return {
    systemId,
    userId,
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
        if (pushPaused && pushFiber !== null) {
          const pausedFiber = pushFiber;
          yield* Fiber.interrupt(pausedFiber);
          if (pushFiber === pausedFiber) pushFiber = null;
        } else if (!pushPaused && pushLane !== null && pushSignal !== null) {
          if (pushFiber === null) {
            pushFiber = yield* Effect.forkIn(pushLane, activePeriod.scope);
          }
          Queue.offerUnsafe(pushSignal, undefined);
        }
      }),
    pushNow: Effect.suspend(() =>
      activePeriod === null ||
      activePeriod.revoked ||
      session.store.getState().sessionStatus !== 'current'
        ? Effect.fail(
            new ZerospinError({
              code: 'aggregate-frontend-session-not-current',
            }),
          )
        : pushOne,
    ),
  };
});
