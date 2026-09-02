import type { Async } from '@zerospin/core/async/Async';
import type { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IServiceFrontendController } from '@zerospin/core/frontendController/types';
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
import type { IOpfsBackupWorker } from '@zerospin/opfs-backup-worker';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect, Queue, Result, Schema, Semaphore, type Scope } from 'effect';

import { createServiceFrontendWebSocketTicket } from './createServiceFrontendWebSocketTicket.ts';
import { fetchServiceFrontendState } from './fetchServiceFrontendState.ts';
import { frontendPushRetrySchedule } from './frontendPushRetrySchedule.ts';
import { makeServiceFrontendBackupKey } from './makeServiceFrontendBackupKey.ts';

export const bootstrapServiceFrontendSession = Effect.fn(
  'bootstrapServiceFrontendSession',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  session: IServiceSession<FRONTEND>;
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  backupWorker: IOpfsBackupWorker;
}): Effect.fn.Return<
  Readonly<{ systemId: ISystemId; userId: string }>,
  IAnyError,
  Async | Scope.Scope | TelemetryCollector
> {
  const { backupWorker, session } = props;
  const frontend = session.frontend;
  const context = yield* Effect.context<Async | TelemetryCollector>();
  const completeFrontendSpec = makeFrontendControllerSpec(frontend);
  const frontendSpec = {
    ...completeFrontendSpec,
    models: Object.fromEntries(
      Object.entries(completeFrontendSpec.models).map(([key, model]) => [
        key,
        { ...model, historicalDefinitions: [] },
      ]),
    ),
  };
  const serviceFrontendLockKey = yield* makeServiceFrontendLockKey(
    frontendSpec.serviceFrontendLock,
  );
  const dbConfig = makeResourceDbConfig<
    FRONTEND['models'],
    typeof serviceSessionRepoTables
  >({
    models: frontend.models,
    otherTables: serviceSessionRepoTables,
  });
  const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
  let released = false;
  let socket: WebSocket | null = null;
  let backupAccepting = false;
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

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      released = true;
      backupAccepting = false;
      db.$client.onCommittedTransaction = null;
      socket?.close(1000, 'released');
      socket = null;
      const state = session.store.getState();
      if (state.isInitialized) {
        const backupKey = yield* makeServiceFrontendBackupKey({
          systemId: state.systemId,
          userId: state.userId,
          serviceName: state.serviceName,
          frontendName: state.frontendName,
          serviceFrontendLockKey: state.serviceFrontendLockKey,
        });
        yield* backupWorker
          .closeSessionBackup({ backupKey, sessionId: session.sessionId })
          .pipe(Effect.ignore);
      }
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

  const authenticationLocatorKey = `zerospin:authentication:${JSON.stringify({
    apiUrl: props.apiUrl,
    publishableKey: props.publishableKey,
    systemName: props.systemName,
    authenticationLock: props.authenticationLock,
  })}`;
  const initialState = yield* fetchServiceFrontendState({
    apiUrl: props.apiUrl,
    publishableKey: props.publishableKey,
    systemName: props.systemName,
    authenticationLock: props.authenticationLock,
    generateSignature: props.generateSignature,
    serviceName: frontend.serviceName,
    frontendName: frontend.frontendName,
    serviceFrontendLock: frontendSpec.serviceFrontendLock,
  }).pipe(Effect.result);

  let online = Result.isSuccess(initialState);
  let systemId: ISystemId;
  let userId: string;
  if (Result.isSuccess(initialState)) {
    systemId = initialState.success.systemId;
    userId = initialState.success.userId;
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
  } else {
    if (!transientCodes.has(initialState.failure.code)) {
      return yield* initialState.failure;
    }
    const persistedIdentity = yield* Effect.try({
      try: () => localStorage.getItem(authenticationLocatorKey),
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'Failed to read the browser authentication locator',
      }),
    });
    if (persistedIdentity === null) {
      return yield* new ZerospinError({
        code: 'offline-user-locator-unavailable',
        message: 'Offline startup requires a persisted authentication locator',
      });
    }
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
  }

  const backupKey = yield* makeServiceFrontendBackupKey({
    systemId,
    userId,
    serviceName: frontend.serviceName,
    frontendName: frontend.frontendName,
    serviceFrontendLockKey,
  });
  const sessionLocatorKey = `zerospin:frontend-session:${backupKey}`;
  const persistedSelectedSessionId = yield* Effect.try({
    try: () => localStorage.getItem(sessionLocatorKey),
    catch: ZerospinError.catch({
      code: 'browser-persistence-reset-required',
      message: 'Failed to read the current frontend-session locator',
    }),
  });
  const selectedSessionId =
    persistedSelectedSessionId === null
      ? null
      : yield* Schema.decodeUnknownEffect(makeAbbreviationIdSchema('sesn'))(
          persistedSelectedSessionId,
        ).pipe(
          Effect.mapError(
            () =>
              new ZerospinError({
                code: 'browser-persistence-reset-required',
                message: 'The current frontend-session locator is invalid',
              }),
          ),
        );
  const backupSessionIds = yield* backupWorker
    .listSessionBackups({ backupKey })
    .pipe(
      Effect.retry({
        times: 1,
        while: error => error.code === 'opfs-backup-request-uncertain',
      }),
    );
  const selectedSnapshot =
    selectedSessionId === null
      ? null
      : yield* backupWorker
          .exportSnapshot({
            backupKey,
            sessionId: selectedSessionId,
          })
          .pipe(
            Effect.retry({
              times: 1,
              while: error => error.code === 'opfs-backup-request-uncertain',
            }),
          );
  if (!online && selectedSnapshot === null) {
    return yield* new ZerospinError({
      code: 'browser-persistence-reset-required',
      message: 'Offline startup requires the locator-selected service backup',
    });
  }
  if (selectedSnapshot !== null) {
    yield* Effect.try({
      try: () => {
        const sourceDb = db.$client.sqlite3.open_v2Sync(':memory:');
        try {
          const deserializeResult = db.$client.sqlite3.deserialize(
            sourceDb,
            'main',
            selectedSnapshot,
            selectedSnapshot.byteLength,
            selectedSnapshot.byteLength,
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
            throw new Error(`sqlite3_backup failed with code ${backupResult}`);
          }
        } finally {
          db.$client.sqlite3.close(sourceDb);
        }
        db.update(serviceSessionMetadataDrizzleSchema)
          .set({ sessionId: session.sessionId })
          .run();
      },
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'Failed to restore the current service frontend backup',
      }),
    });
  }

  const reconnectSignal = yield* Queue.unbounded<void>();
  const recoverySemaphore = yield* Semaphore.make(1);
  const recoverOnline = recoverySemaphore.withPermits(1)(
    Effect.gen(function* () {
      socket?.close(1000, 'reconnecting');
      socket = null;
      const ticket = yield* createServiceFrontendWebSocketTicket({
        apiUrl: props.apiUrl,
        publishableKey: props.publishableKey,
        systemName: props.systemName,
        authenticationLock: props.authenticationLock,
        generateSignature: props.generateSignature,
        serviceName: frontend.serviceName,
        frontendName: frontend.frontendName,
        serviceFrontendLock: frontendSpec.serviceFrontendLock,
      });
      const bufferedCommands: IEncodedCommand<IServiceFrontendFinalizedCommand>[] =
        [];
      const replayComplete = Promise.withResolvers<number>();
      const opened = Promise.withResolvers<void>();
      socket = yield* Effect.try({
        try: () => {
          const url = new URL(props.apiUrl);
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          url.pathname = '/ws-service-frontend-commands';
          url.search = '';
          url.searchParams.set('ticket', ticket.ticket);
          const nextSocket = new WebSocket(url);
          nextSocket.onopen = () => {
            nextSocket.send(JSON.stringify({ serviceFrontendIndex: 0 }));
            opened.resolve();
          };
          nextSocket.onerror = () =>
            opened.reject(new Error('WebSocket open failed'));
          nextSocket.onclose = () =>
            replayComplete.reject(
              new Error('WebSocket closed before finalized replay completed'),
            );
          nextSocket.onmessage = event => {
            try {
              const message = JSON.parse(String(event.data));
              if (message.type === 'serviceFrontendCommand') {
                bufferedCommands.push(message.sync);
              } else if (message.type === 'replay-complete') {
                replayComplete.resolve(message.serviceFrontendIndex);
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
        }),
      });
      yield* Effect.tryPromise({
        try: () => opened.promise,
        catch: ZerospinError.catch({
          code: 'service-frontend-websocket-open-failed',
        }),
      });
      const recoveryState = yield* fetchServiceFrontendState({
        apiUrl: props.apiUrl,
        publishableKey: props.publishableKey,
        systemName: props.systemName,
        authenticationLock: props.authenticationLock,
        generateSignature: props.generateSignature,
        serviceName: frontend.serviceName,
        frontendName: frontend.frontendName,
        serviceFrontendLock: frontendSpec.serviceFrontendLock,
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
        (left, right) => left.serviceFrontendIndex - right.serviceFrontendIndex,
      );
      if (
        replayTip < recoveryState.serviceFrontendIndex ||
        decodedFinalized.length !== replayTip ||
        decodedFinalized.some(
          (command, index) => command.serviceFrontendIndex !== index + 1,
        )
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-finalized-replay-invalid',
          message:
            'Service finalized socket replay was incomplete or non-contiguous',
        });
      }
      db.$client.onCommittedTransaction = null;
      yield* applyServiceFrontendState({
        frontend,
        sessionId: session.sessionId,
        userId,
        systemId,
        db,
        models: frontend.models,
        frontendState: recoveryState,
      });
      for (const command of decodedFinalized) {
        if (
          command.serviceFrontendIndex <= recoveryState.serviceFrontendIndex
        ) {
          continue;
        }
        yield* applyServiceFrontendCommand({
          frontend,
          sessionId: session.sessionId,
          db,
          models: frontend.models,
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
            const applied = yield* applyServiceFrontendCommand({
              frontend,
              sessionId: session.sessionId,
              db,
              models: frontend.models,
              command,
            });
            if (applied === 'duplicate') return;
            const nextMetadata = db
              .select()
              .from(serviceSessionMetadataDrizzleSchema)
              .where(
                eq(
                  serviceSessionMetadataDrizzleSchema.sessionId,
                  session.sessionId,
                ),
              )
              .get();
            if (nextMetadata !== undefined) {
              session.store.setState({
                serviceIndex: nextMetadata.serviceIndex,
                serviceFrontendIndex: nextMetadata.serviceFrontendIndex,
              });
            }
          }).pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                session.store.setState({ sessionStatus: 'failed' });
                currentSocket.close(4003, 'failed');
              }),
            ),
          ),
        );
      };
      currentSocket.onclose = () => {
        if (!released && socket === currentSocket) {
          online = false;
          if (session.store.getState().sessionStatus === 'current') {
            Queue.offerUnsafe(reconnectSignal, undefined);
          }
        }
      };
      online = true;
    }),
  );

  if (online) {
    const recovered = yield* recoverOnline.pipe(Effect.result);
    if (Result.isFailure(recovered)) {
      if (
        selectedSnapshot === null ||
        !transientCodes.has(recovered.failure.code)
      ) {
        return yield* recovered.failure;
      }
      online = false;
    }
  }

  const metadata = db
    .select()
    .from(serviceSessionMetadataDrizzleSchema)
    .where(eq(serviceSessionMetadataDrizzleSchema.sessionId, session.sessionId))
    .get();
  if (metadata === undefined) {
    return yield* new ZerospinError({
      code: 'browser-persistence-reset-required',
      message: 'The restored service frontend metadata is missing',
    });
  }

  const transactionQueue =
    yield* Queue.unbounded<readonly ICommittedSqlStatement[]>();
  backupAccepting = true;
  db.$client.onCommittedTransaction = statements => {
    if (backupAccepting) {
      session.store.setState({
        backupState: { status: 'pending', failure: null },
      });
      Queue.offerUnsafe(transactionQueue, statements);
    }
  };
  const baseline = yield* Effect.sync(() =>
    db.$client.sqlite3.serialize(db.$client.db, 'main'),
  );
  yield* backupWorker
    .replaceSnapshot({
      backupKey,
      sessionId: session.sessionId,
      snapshot: baseline,
    })
    .pipe(
      Effect.retry({
        times: 1,
        while: error => error.code === 'opfs-backup-request-uncertain',
      }),
    );
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        const statements = yield* Queue.take(transactionQueue);
        if (!backupAccepting) return;
        const applied = yield* backupWorker
          .applyTransaction({
            backupKey,
            sessionId: session.sessionId,
            statements,
          })
          .pipe(Effect.result);
        if (Result.isSuccess(applied)) {
          if (Queue.sizeUnsafe(transactionQueue) === 0) {
            session.store.setState({
              backupState: { status: 'ready', failure: null },
            });
          }
          return;
        }
        session.store.setState({
          backupState: { status: 'repairing', failure: null },
        });
        backupAccepting = false;
        const repairTransactions: (readonly ICommittedSqlStatement[])[] = [];
        db.$client.onCommittedTransaction = nextStatements => {
          repairTransactions.push(nextStatements);
        };
        while (Queue.sizeUnsafe(transactionQueue) > 0) {
          yield* Queue.take(transactionQueue);
        }
        const snapshot = yield* Effect.sync(() =>
          db.$client.sqlite3.serialize(db.$client.db, 'main'),
        );
        const repaired = yield* backupWorker
          .replaceSnapshot({
            backupKey,
            sessionId: session.sessionId,
            snapshot,
          })
          .pipe(
            Effect.retry({
              times: 1,
              while: error => error.code === 'opfs-backup-request-uncertain',
            }),
            Effect.result,
          );
        if (Result.isFailure(repaired)) {
          session.store.setState({
            backupState: {
              status: 'failed',
              failure: Schema.encodeSync(ZerospinError.schema)(
                repaired.failure,
              ),
            },
          });
          db.$client.onCommittedTransaction = null;
          return;
        }
        db.$client.onCommittedTransaction = nextStatements => {
          if (backupAccepting) {
            session.store.setState({
              backupState: { status: 'pending', failure: null },
            });
            Queue.offerUnsafe(transactionQueue, nextStatements);
          }
        };
        for (const repairTransaction of repairTransactions) {
          Queue.offerUnsafe(transactionQueue, repairTransaction);
        }
        backupAccepting = true;
        session.store.setState({
          backupState: {
            status: repairTransactions.length === 0 ? 'ready' : 'pending',
            failure: null,
          },
        });
      }),
    ),
  );

  yield* Effect.try({
    try: () => localStorage.setItem(sessionLocatorKey, session.sessionId),
    catch: ZerospinError.catch({
      code: 'browser-persistence-reset-required',
      message: 'Failed to publish the current service-session locator',
    }),
  });
  session.store.setState({
    sessionId: session.sessionId,
    serviceName: frontend.serviceName,
    userId,
    systemId,
    systemVersion: metadata.systemVersion,
    frontendName: frontend.frontendName,
    serviceFrontendLockKey,
    db,
    schema: dbConfig.schema,
    models: frontend.models,
    isInitialized: true,
    serviceIndex: metadata.serviceIndex,
    serviceFrontendIndex: metadata.serviceFrontendIndex,
    sessionStatus: 'current',
    backupState: { status: 'ready', failure: null },
  });

  for (const oldSessionId of backupSessionIds) {
    if (oldSessionId === session.sessionId) continue;
    yield* backupWorker
      .closeSessionBackup({ backupKey, sessionId: oldSessionId })
      .pipe(Effect.ignore);
    yield* backupWorker
      .deleteSessionBackup({ backupKey, sessionId: oldSessionId })
      .pipe(Effect.ignore);
  }

  const onlineListener = () => {
    if (!released && session.store.getState().sessionStatus === 'current') {
      Queue.offerUnsafe(reconnectSignal, undefined);
    }
  };
  globalThis.addEventListener('online', onlineListener);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => globalThis.removeEventListener('online', onlineListener)),
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
        if (released || session.store.getState().sessionStatus !== 'current') {
          return;
        }
        const recovered = yield* recoverOnline.pipe(
          Effect.retry({
            schedule: frontendPushRetrySchedule,
            while: error =>
              transientCodes.has(error.code) &&
              !released &&
              session.store.getState().sessionStatus === 'current',
          }),
          Effect.result,
        );
        if (Result.isFailure(recovered)) {
          if (
            !released &&
            session.store.getState().sessionStatus === 'current'
          ) {
            session.store.setState({ sessionStatus: 'failed' });
          }
          return;
        }
        while (online && Queue.sizeUnsafe(reconnectSignal) > 0) {
          yield* Queue.take(reconnectSignal);
        }

        const repairTransactions: (readonly ICommittedSqlStatement[])[] = [];
        backupAccepting = false;
        session.store.setState({
          backupState: { status: 'repairing', failure: null },
        });
        db.$client.onCommittedTransaction = statements => {
          repairTransactions.push(statements);
        };
        while (Queue.sizeUnsafe(transactionQueue) > 0) {
          yield* Queue.take(transactionQueue);
        }
        const snapshot = yield* Effect.sync(() =>
          db.$client.sqlite3.serialize(db.$client.db, 'main'),
        );
        const replaced = yield* backupWorker
          .replaceSnapshot({
            backupKey,
            sessionId: session.sessionId,
            snapshot,
          })
          .pipe(
            Effect.retry({
              times: 1,
              while: error => error.code === 'opfs-backup-request-uncertain',
            }),
            Effect.result,
          );
        if (Result.isFailure(replaced)) {
          db.$client.onCommittedTransaction = null;
          session.store.setState({
            backupState: {
              status: 'failed',
              failure: Schema.encodeSync(ZerospinError.schema)(
                replaced.failure,
              ),
            },
          });
        } else {
          db.$client.onCommittedTransaction = statements => {
            if (backupAccepting) {
              session.store.setState({
                backupState: { status: 'pending', failure: null },
              });
              Queue.offerUnsafe(transactionQueue, statements);
            }
          };
          for (const repairTransaction of repairTransactions) {
            Queue.offerUnsafe(transactionQueue, repairTransaction);
          }
          backupAccepting = true;
          session.store.setState({
            backupState: {
              status: repairTransactions.length === 0 ? 'ready' : 'pending',
              failure: null,
            },
          });
        }
        const recoveredMetadata = db
          .select()
          .from(serviceSessionMetadataDrizzleSchema)
          .where(
            eq(
              serviceSessionMetadataDrizzleSchema.sessionId,
              session.sessionId,
            ),
          )
          .get();
        if (recoveredMetadata !== undefined) {
          session.store.setState({
            serviceIndex: recoveredMetadata.serviceIndex,
            serviceFrontendIndex: recoveredMetadata.serviceFrontendIndex,
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
            message: 'Failed to refresh the browser authentication locator',
          }),
        });
      }),
    ),
  );

  const storageListener = (event: StorageEvent) => {
    if (
      event.key === sessionLocatorKey &&
      event.newValue !== null &&
      event.newValue !== session.sessionId
    ) {
      const state = session.store.getState();
      if (state.isInitialized && state.sessionStatus === 'current') {
        session.store.setState({ sessionStatus: 'superseded' });
        socket?.close(1000, 'superseded');
        socket = null;
        if (document.visibilityState === 'visible') {
          globalThis.location.reload();
        }
      }
    }
  };
  const visibilityListener = () => {
    if (
      document.visibilityState === 'visible' &&
      localStorage.getItem(sessionLocatorKey) !== session.sessionId
    ) {
      globalThis.location.reload();
    }
  };
  globalThis.addEventListener('storage', storageListener);
  document.addEventListener('visibilitychange', visibilityListener);
  globalThis.addEventListener('pageshow', visibilityListener);
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      globalThis.removeEventListener('storage', storageListener);
      document.removeEventListener('visibilitychange', visibilityListener);
      globalThis.removeEventListener('pageshow', visibilityListener);
    }),
  );

  return { systemId, userId };
});
