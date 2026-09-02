import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
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
import { sessionCommandJournalDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
  sessionResolvedPushDrizzleSchema,
} from '@zerospin/core/session/sessionRepoTables';
import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendPushedCommand,
  IFrontendDelta,
  ISession,
  ISessionId,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import type { IOpfsBackupWorker } from '@zerospin/opfs-backup-worker';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { eq, isNull } from 'drizzle-orm';
import {
  Effect,
  Fiber,
  Queue,
  Result,
  Schema,
  Semaphore,
  type Scope,
} from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

import { createAggregateFrontendWebSocketTicket } from './createAggregateFrontendWebSocketTicket.ts';
import { fetchAggregateFrontendState } from './fetchAggregateFrontendState.ts';
import { frontendPushRetrySchedule } from './frontendPushRetrySchedule.ts';
import { makeAggregateFrontendBackupKey } from './makeAggregateFrontendBackupKey.ts';
import { pushAggregateFrontendCommand } from './pushAggregateFrontendCommand.ts';

export const bootstrapAggregateFrontendSession = Effect.fn(
  'bootstrapAggregateFrontendSession',
)(function* <FRONTEND extends IAggregateFrontendController>(props: {
  session: ISession<FRONTEND>;
  aggregateId: IAggregateId;
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
  generateSignature(): Promise<IEncodedResult<unknown, IAnyErrorJson>>;
  backupWorker: IOpfsBackupWorker;
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
  const { aggregateId, backupWorker, session } = props;
  const frontend = session.frontend;
  const context = yield* Effect.context<Async | TelemetryCollector>();
  const scope = yield* Effect.scope;
  const completeFrontendSpec = makeFrontendControllerSpec(frontend);
  const frontendSpec = {
    ...completeFrontendSpec,
    models: Object.fromEntries(
      Object.entries(completeFrontendSpec.models).map(([key, model]) => [
        key,
        { ...model, historicalDefinitions: [] },
      ]),
    ),
    contracts: Object.fromEntries(
      Object.entries(completeFrontendSpec.contracts).map(([key, contract]) => [
        key,
        { ...contract, historicalDefinitions: [] },
      ]),
    ),
  };
  const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
    frontendSpec.aggregateFrontendLock,
  );
  const models = getFrontendDbModels(frontend);
  const dbConfig = makeResourceDbConfig({
    models,
    otherTables: sessionRepoTables,
  });
  const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
  let released = false;
  let pushPaused = false;
  let socket: WebSocket | null = null;
  let backupAccepting = false;
  let pushFiber: Fiber.Fiber<unknown, unknown> | null = null;
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

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      released = true;
      backupAccepting = false;
      db.$client.onCommittedTransaction = null;
      socket?.close(1000, 'released');
      socket = null;
      if (pushFiber !== null) yield* Fiber.interrupt(pushFiber);
      const state = session.store.getState();
      if (state.isInitialized) {
        const backupKey = yield* makeAggregateFrontendBackupKey({
          systemId: state.systemId,
          userId: state.userId,
          aggregateId: state.aggregateId,
          aggregateName: state.aggregateName,
          frontendName: state.frontendName,
          aggregateFrontendLockKey: state.aggregateFrontendLockKey,
        });
        yield* backupWorker
          .closeSessionBackup({
            backupKey,
            sessionId: session.sessionId,
          })
          .pipe(Effect.ignore);
      }
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

  const authenticationLocatorKey = `zerospin:authentication:${JSON.stringify({
    apiUrl: props.apiUrl,
    publishableKey: props.publishableKey,
    systemName: props.systemName,
    authenticationLock: props.authenticationLock,
  })}`;
  const initialState = yield* fetchAggregateFrontendState({
    apiUrl: props.apiUrl,
    publishableKey: props.publishableKey,
    systemName: props.systemName,
    authenticationLock: props.authenticationLock,
    generateSignature: props.generateSignature,
    aggregateId,
    aggregateName: frontend.aggregateName,
    frontendName: frontend.frontendName,
    aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
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

  const backupKey = yield* makeAggregateFrontendBackupKey({
    systemId,
    userId,
    aggregateId,
    aggregateName: frontend.aggregateName,
    frontendName: frontend.frontendName,
    aggregateFrontendLockKey,
  });
  const sessionLocatorKey = `zerospin:frontend-session:${backupKey}`;
  const persistedSelectedSessionId = yield* Effect.try({
    try: () => localStorage.getItem(sessionLocatorKey),
    catch: ZerospinError.catch({
      code: 'browser-persistence-reset-required',
      message: 'Failed to read the current frontend-session locator',
    }),
  });
  if (
    persistedSelectedSessionId !== null &&
    !/^sesn_[A-Za-z0-9_-]+$/.test(persistedSelectedSessionId)
  ) {
    return yield* new ZerospinError({
      code: 'browser-persistence-reset-required',
      message: 'The current frontend-session locator is invalid',
    });
  }
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
      message: 'Offline startup requires the locator-selected frontend backup',
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
        db.update(sessionMetadataDrizzleSchema)
          .set({ sessionId: session.sessionId })
          .run();
        db.update(sessionResolvedPushDrizzleSchema)
          .set({ sessionId: session.sessionId })
          .run();
      },
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'Failed to restore the current aggregate frontend backup',
      }),
    });
  }

  const oldSessionFiles: Array<{
    sessionId: ISessionId;
    commands: IEncodedCommand<
      IChainedCommand<ISessionCommand, IFrontendDelta> &
        Readonly<{ sessionIndex: number; pushIndex: null }>
    >[];
  }> = [];
  for (const oldSessionId of backupSessionIds) {
    if (oldSessionId === selectedSessionId) continue;
    const snapshot = yield* backupWorker
      .exportSnapshot({
        backupKey,
        sessionId: oldSessionId,
      })
      .pipe(
        Effect.retry({
          times: 1,
          while: error => error.code === 'opfs-backup-request-uncertain',
        }),
      );
    if (snapshot === null) continue;
    const oldDb = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
    yield* Effect.try({
      try: () => {
        const result = oldDb.$client.sqlite3.deserialize(
          oldDb.$client.db,
          'main',
          snapshot,
          snapshot.byteLength,
          snapshot.byteLength,
          1,
        );
        if (result !== 0) {
          throw new Error(`sqlite3_deserialize failed with code ${result}`);
        }
      },
      catch: ZerospinError.catch({
        code: 'browser-persistence-reset-required',
        message: 'Failed to inspect an old aggregate frontend backup',
      }),
    });
    const commands = [];
    for (const row of oldDb
      .select()
      .from(sessionCommandJournalDrizzleSchema)
      .where(isNull(sessionCommandJournalDrizzleSchema.pushIndex))
      .all()
      .filter(row => row.sessionIndex !== null)
      .sort(
        (left, right) => (left.sessionIndex ?? 0) - (right.sessionIndex ?? 0),
      )) {
      commands.push(
        yield* Schema.decodeEffect(Schema.fromJsonString(SessionCommandSchema))(
          row.command,
        ).pipe(
          Effect.mapError(
            () =>
              new ZerospinError({
                code: 'browser-persistence-reset-required',
                message: 'An old backup contains an invalid local command',
              }),
          ),
          Effect.flatMap(command =>
            command.pushIndex !== null
              ? Effect.fail(
                  new ZerospinError({
                    code: 'browser-persistence-reset-required',
                    message: 'An old backup contains an invalid local command',
                  }),
                )
              : Effect.succeed(command),
          ),
        ),
      );
    }
    yield* Effect.tryPromise({
      try: () => oldDb.$client.sqlite3.close(oldDb.$client.db),
      catch: ZerospinError.catch({ code: 'old-session-database-close-failed' }),
    }).pipe(Effect.ignore);
    if (!online && commands.length > 0) {
      return yield* new ZerospinError({
        code: 'offline-old-session-commands-unresolved',
        message:
          'Offline startup cannot recover unresolved old-session commands',
      });
    }
    oldSessionFiles.push({ sessionId: oldSessionId, commands });
  }

  const reconnectSignal = yield* Queue.unbounded<void>();
  const recoverySemaphore = yield* Semaphore.make(1);
  const recoverOnline = recoverySemaphore.withPermits(1)(
    Effect.gen(function* () {
      const bufferedCommands: IEncodedCommand<IAggregateFrontendFinalizedCommand>[] =
        [];
      socket?.close(1000, 'reconnecting');
      socket = null;
      const ticket = yield* createAggregateFrontendWebSocketTicket({
        apiUrl: props.apiUrl,
        publishableKey: props.publishableKey,
        systemName: props.systemName,
        authenticationLock: props.authenticationLock,
        generateSignature: props.generateSignature,
        aggregateId,
        aggregateName: frontend.aggregateName,
        frontendName: frontend.frontendName,
        aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
      });
      const replayComplete = Promise.withResolvers<number>();
      const opened = Promise.withResolvers<void>();
      socket = yield* Effect.try({
        try: () => {
          const url = new URL(props.apiUrl);
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          url.pathname = '/ws-aggregate-frontend-commands';
          url.search = '';
          url.searchParams.set('ticket', ticket.ticket);
          const nextSocket = new WebSocket(url);
          nextSocket.onopen = () => {
            nextSocket.send(JSON.stringify({ frontendIndex: 0 }));
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
              if (message.type === 'aggregateFrontendCommand') {
                bufferedCommands.push(message.sync);
              } else if (message.type === 'replay-complete') {
                replayComplete.resolve(message.frontendIndex);
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
        }),
      });
      yield* Effect.tryPromise({
        try: () => opened.promise,
        catch: ZerospinError.catch({
          code: 'aggregate-frontend-websocket-open-failed',
        }),
      });

      for (const oldFile of oldSessionFiles) {
        for (const command of oldFile.commands) {
          yield* pushAggregateFrontendCommand({
            apiUrl: props.apiUrl,
            publishableKey: props.publishableKey,
            systemName: props.systemName,
            authenticationLock: props.authenticationLock,
            generateSignature: props.generateSignature,
            aggregateId,
            aggregateName: frontend.aggregateName,
            frontendName: frontend.frontendName,
            aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
            command,
          });
        }
      }

      const recoveryState = yield* fetchAggregateFrontendState({
        apiUrl: props.apiUrl,
        publishableKey: props.publishableKey,
        systemName: props.systemName,
        authenticationLock: props.authenticationLock,
        generateSignature: props.generateSignature,
        aggregateId,
        aggregateName: frontend.aggregateName,
        frontendName: frontend.frontendName,
        aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
      });
      const pushedCommands: IEncodedCommand<IAggregateFrontendPushedCommand>[] =
        [];
      let afterPushIndex = 0;
      for (;;) {
        const signature = yield* makeAsync(props.generateSignature).pipe(
          Effect.flatMap(decodeRpc),
        );
        const gatewayApi = newSyncRpcSession<GatewayApi>(props.apiUrl);
        const page = yield* makeTraceableApiTarget(
          gatewayApi.getAggregateFrontendApi({
            publishableKey: props.publishableKey,
            systemName: props.systemName,
            authenticationLock: props.authenticationLock,
            signature,
            aggregateId,
            aggregateName: frontend.aggregateName,
            frontendName: frontend.frontendName,
            aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
          }),
        )
          .getPushedCommands({ afterPushIndex })
          .pipe(
            Effect.mapError(error =>
              error instanceof Error
                ? ZerospinError.catch({ code: 'async-failed' })(error)
                : new ZerospinError(error),
            ),
            Effect.ensuring(Effect.sync(() => gatewayApi[Symbol.dispose]())),
          );
        for (const command of page.commands) pushedCommands.push(command);
        if (afterPushIndex === page.tip || page.commands.length === 0) break;
        afterPushIndex = page.commands.at(-1)?.pushIndex ?? afterPushIndex;
      }
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
        (left, right) => left.frontendIndex - right.frontendIndex,
      );
      if (
        replayTip < recoveryState.frontendIndex ||
        decodedFinalized.length !== replayTip ||
        decodedFinalized.some(
          (command, index) => command.frontendIndex !== index + 1,
        )
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-finalized-replay-invalid',
          message: 'Finalized socket replay was incomplete or non-contiguous',
        });
      }
      const resolvedPushIndexes = new Set(recoveryState.resolvedPushIndexes);
      for (const command of decodedFinalized) {
        if (
          command.frontendIndex <= recoveryState.frontendIndex &&
          'pushIndex' in command &&
          command.pushIndex !== null &&
          !resolvedPushIndexes.has(command.pushIndex)
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-finalized-replay-conflict',
            message:
              'Finalized replay conflicts with resolved pushed membership',
          });
        }
      }
      db.$client.onCommittedTransaction = null;
      yield* applyAggregateFrontendState({
        db,
        frontend,
        sessionId: session.sessionId,
        models,
        frontendState: recoveryState,
        pushedCommands,
        aggregateId,
        userId,
        systemId,
      });
      for (const command of decodedFinalized) {
        if (command.frontendIndex <= recoveryState.frontendIndex) continue;
        yield* applyAggregateFrontendCommand({
          db,
          frontend,
          sessionId: session.sessionId,
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
          message: 'The aggregate frontend WebSocket was not retained',
        });
      }
      currentSocket.onmessage = (event: MessageEvent) => {
        void Effect.runPromiseWith(context)(
          Effect.gen(function* () {
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
            const applied = yield* applyAggregateFrontendCommand({
              db,
              frontend,
              sessionId: session.sessionId,
              models,
              command,
              aggregateId,
              userId,
            });
            if (applied === 'duplicate') return;
            const state = session.store.getState();
            if (state.isInitialized) {
              const nextMetadata = db
                .select()
                .from(sessionMetadataDrizzleSchema)
                .where(
                  eq(sessionMetadataDrizzleSchema.sessionId, session.sessionId),
                )
                .get();
              if (nextMetadata !== undefined) {
                session.store.setState({
                  aggregateIndex: nextMetadata.aggregateIndex,
                  frontendIndex: nextMetadata.frontendIndex,
                  pushIndex: nextMetadata.pushIndex,
                });
              }
            }
          }).pipe(
            Effect.catch(error =>
              Effect.sync(() => {
                const failure = Schema.encodeSync(ZerospinError.schema)(error);
                session.store.setState({ sessionStatus: 'failed' });
                currentSocket.close(4003, failure.code);
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
      if (oldSessionFiles.some(oldFile => oldFile.commands.length > 0)) {
        return yield* new ZerospinError({
          code: 'offline-old-session-commands-unresolved',
          message:
            'Offline startup cannot recover unresolved old-session commands',
        });
      }
    }
  }

  const metadata = db
    .select()
    .from(sessionMetadataDrizzleSchema)
    .where(eq(sessionMetadataDrizzleSchema.sessionId, session.sessionId))
    .get();
  if (metadata === undefined) {
    return yield* new ZerospinError({
      code: 'browser-persistence-reset-required',
      message: 'The restored aggregate frontend metadata is missing',
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
          const failure = yield* Schema.encodeEffect(ZerospinError.schema)(
            repaired.failure,
          );
          session.store.setState({
            backupState: { status: 'failed', failure },
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
      message: 'Failed to publish the current frontend-session locator',
    }),
  });
  session.store.setState({
    sessionId: session.sessionId,
    aggregateId,
    aggregateName: frontend.aggregateName,
    userId,
    systemId,
    systemVersion: metadata.systemVersion,
    frontendName: frontend.frontendName,
    aggregateFrontendLockKey,
    db,
    schema: dbConfig.schema,
    models,
    isInitialized: true,
    aggregateIndex: metadata.aggregateIndex,
    frontendIndex: metadata.frontendIndex,
    pushIndex: metadata.pushIndex,
    sessionStatus: 'current',
    backupState: { status: 'ready', failure: null },
  });

  for (const oldFile of oldSessionFiles) {
    yield* backupWorker.closeSessionBackup({
      backupKey,
      sessionId: oldFile.sessionId,
    });
    yield* backupWorker
      .deleteSessionBackup({ backupKey, sessionId: oldFile.sessionId })
      .pipe(Effect.ignore);
  }
  if (selectedSessionId !== null && selectedSessionId !== session.sessionId) {
    yield* backupWorker
      .closeSessionBackup({ backupKey, sessionId: selectedSessionId })
      .pipe(Effect.ignore);
    yield* backupWorker
      .deleteSessionBackup({ backupKey, sessionId: selectedSessionId })
      .pipe(Effect.ignore);
  }

  const pushSignal = yield* Queue.unbounded<void>();
  const pushSemaphore = yield* Semaphore.make(1);
  const pushOne = pushSemaphore.withPermits(1)(
    Effect.gen(function* () {
      const row = db
        .select()
        .from(sessionCommandJournalDrizzleSchema)
        .where(isNull(sessionCommandJournalDrizzleSchema.pushIndex))
        .all()
        .filter(row => row.sessionIndex !== null)
        .sort(
          (left, right) => (left.sessionIndex ?? 0) - (right.sessionIndex ?? 0),
        )[0];
      if (row === undefined) {
        return { status: 'empty' } satisfies Readonly<{ status: 'empty' }>;
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
        apiUrl: props.apiUrl,
        publishableKey: props.publishableKey,
        systemName: props.systemName,
        authenticationLock: props.authenticationLock,
        generateSignature: props.generateSignature,
        aggregateId,
        aggregateName: frontend.aggregateName,
        frontendName: frontend.frontendName,
        aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
        command,
      }).pipe(
        Effect.retry({
          schedule: frontendPushRetrySchedule,
          while: error =>
            transientCodes.has(error.code) && !pushPaused && !released,
        }),
        Effect.result,
      );
      if (Result.isFailure(pushed)) {
        return {
          status: 'retry-exhausted',
          failure: Schema.encodeSync(ZerospinError.schema)(pushed.failure),
        } satisfies Readonly<{
          status: 'retry-exhausted';
          failure: IAnyErrorJson;
        }>;
      }
      yield* applyAggregateFrontendCommand({
        db,
        frontend,
        sessionId: session.sessionId,
        models,
        command: pushed.success,
        aggregateId,
        userId,
      });
      const nextMetadata = db
        .select()
        .from(sessionMetadataDrizzleSchema)
        .where(eq(sessionMetadataDrizzleSchema.sessionId, session.sessionId))
        .get();
      if (nextMetadata !== undefined) {
        session.store.setState({ pushIndex: nextMetadata.pushIndex });
      }
      return { status: 'pushed' } satisfies Readonly<{ status: 'pushed' }>;
    }),
  );

  const pushLane = Effect.forever(
    Effect.gen(function* () {
      yield* Queue.take(pushSignal);
      while (!pushPaused && !released) {
        const result = yield* pushOne;
        if (result.status !== 'pushed') break;
      }
    }),
  ).pipe(Effect.provide(context));
  pushFiber = yield* Effect.forkIn(pushLane, scope);
  Queue.offerUnsafe(pushSignal, undefined);

  const onlineListener = () => {
    if (!released && session.store.getState().sessionStatus === 'current') {
      Queue.offerUnsafe(reconnectSignal, undefined);
      Queue.offerUnsafe(pushSignal, undefined);
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
          .from(sessionMetadataDrizzleSchema)
          .where(eq(sessionMetadataDrizzleSchema.sessionId, session.sessionId))
          .get();
        if (recoveredMetadata !== undefined) {
          session.store.setState({
            aggregateIndex: recoveredMetadata.aggregateIndex,
            frontendIndex: recoveredMetadata.frontendIndex,
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
      pushPaused = false;
      const state = session.store.getState();
      if (state.isInitialized && state.sessionStatus === 'current') {
        session.store.setState({ sessionStatus: 'superseded' });
        socket?.close(1000, 'superseded');
        socket = null;
        Queue.offerUnsafe(pushSignal, undefined);
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

  return {
    systemId,
    userId,
    aggregateFrontendLockKey,
    executeAggregateFrontendCommand: ({ command }) =>
      Effect.sync(() => {
        Queue.offerUnsafe(pushSignal, undefined);
        return { commandId: command.id };
      }),
    getPushPaused: Effect.sync(() => pushPaused),
    setPushPaused: ({ pushPaused: nextPushPaused }) =>
      Effect.gen(function* () {
        pushPaused = nextPushPaused;
        if (pushPaused && pushFiber !== null) {
          yield* Fiber.interrupt(pushFiber);
          pushFiber = null;
        } else if (!pushPaused && pushFiber === null) {
          pushFiber = yield* Effect.forkIn(pushLane, scope);
          Queue.offerUnsafe(pushSignal, undefined);
        }
      }),
    pushNow: pushOne.pipe(Effect.provide(context)),
  };
});
