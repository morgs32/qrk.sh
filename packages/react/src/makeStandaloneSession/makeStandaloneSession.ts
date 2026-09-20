import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { initializeGuards as initializeFrontendGuards } from '@zerospin/core/frontendController/initializeGuards';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type {
  IAggregateFrontendController,
  IAnyAggregateFrontendController,
} from '@zerospin/core/frontendController/types';
import type {
  IAnyModels,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { applyAggregateFrontendSnapshot } from '@zerospin/core/session/applyAggregateFrontendSnapshot';
import { makeAggregateSession } from '@zerospin/core/session/makeAggregateSession';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from '@zerospin/core/session/sessionRepoTables';
import type { IAggregateSession } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { makeStandaloneFrontendBackupKey } from '@zerospin/frontend/makeStandaloneFrontendBackupKey';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type CuidFactory,
} from '@zerospin/schema';
import { getTableName, sql } from 'drizzle-orm';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
} from 'effect';

import { BrowserBackup } from '../BrowserBackup/BrowserBackup';
import type { IZerospinRuntime } from '../makeRuntime/makeRuntime';

const SELECTION_GENESIS_HASH =
  'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc';

const STANDALONE_SYSTEM_NAME = 'standalone';

type AuthoredAggregateFrontend = Omit<
  IAggregateFrontendController,
  'systemName'
>;

type SessionRuntimeServices = Async | CuidFactory | MonotonicFactory;

type LifecycleState = {
  attempt: number;
  scope: Scope.Closeable | null;
  fiber: Fiber.Fiber<unknown, unknown> | null;
  cleanup: Promise<void> | null;
  active: boolean;
};

function createLifecycle(): LifecycleState {
  return {
    attempt: 0,
    scope: null,
    fiber: null,
    cleanup: null,
    active: false,
  };
}
function admitInitialization(lifecycle: LifecycleState): {
  attempt: number;
  scope: Scope.Closeable;
  waitForCleanup: Promise<void> | null;
} {
  if (lifecycle.active) {
    throw new ZerospinError({
      code: 'frontend-already-mounted',
      message: 'Session already has an active initialization owner',
    });
  }
  lifecycle.active = true;
  lifecycle.attempt += 1;
  const attempt = lifecycle.attempt;
  const waitForCleanup = lifecycle.cleanup;
  const scope = Effect.runSync(Scope.make());
  lifecycle.scope = scope;
  return { attempt, scope, waitForCleanup };
}

function beginCleanup(
  lifecycle: LifecycleState,
  attempt: number,
  scope: Scope.Closeable,
): Promise<void> {
  if (lifecycle.attempt !== attempt) {
    return lifecycle.cleanup ?? Promise.resolve();
  }
  lifecycle.active = false;
  lifecycle.scope = null;
  lifecycle.fiber = null;
  const cleanup = Effect.runPromise(Scope.close(scope, Exit.void)).finally(
    () => {
      if (lifecycle.cleanup === cleanup && lifecycle.attempt === attempt) {
        lifecycle.cleanup = null;
      }
    },
  );
  lifecycle.cleanup = cleanup;
  return cleanup;
}

function encodeFixtureResources<MODELS extends IAnyModels>(props: {
  models: MODELS;
  resources: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): Effect.Effect<readonly IEncodedResourceShape[], IAnyError> {
  return Effect.gen(function* () {
    const encoded: IEncodedResourceShape[] = [];
    for (const modelResources of Object.values(props.resources)) {
      if (modelResources === undefined) {
        continue;
      }
      const [firstResource] = modelResources;
      if (firstResource === undefined) {
        continue;
      }
      const model = props.models[firstResource.modelName];
      if (model === undefined) {
        return yield* new ZerospinError({
          code: 'standalone-resource-model-not-found',
          message: `Standalone resource model ${firstResource.modelName} was not found`,
        });
      }
      const encodedModelResources = yield* Schema.encodeEffect(
        Schema.Array(
          Schema.Struct({
            id: makeAbbreviationIdSchema(model.abbreviation),
            modelName: Schema.Literal(model.modelName),
            createdAt: Schema.Date,
            updatedAt: Schema.Date,
            version: Schema.String,
            ...model.attributesSchema.fields,
          }),
        ),
      )(modelResources).pipe(
        mapParseError({
          code: 'standalone-resource-encode-failed',
          prefix: `Failed to encode standalone ${firstResource.modelName} resources`,
        }),
      );
      encoded.push(...encodedModelResources);
    }
    return encoded;
  });
}

function restoreSnapshotIntoLiveDb(props: {
  db: {
    $client: {
      sqlite3: {
        open_v2Sync: (path: string) => number;
        deserialize: (
          db: number,
          schema: string,
          data: Uint8Array,
          dataSize: number,
          dataBufSize: number,
          flags: number,
        ) => number;
        backup: (
          dest: number,
          destName: string,
          src: number,
          srcName: string,
        ) => number;
        close: (db: number) => void;
      };
      db: number;
    };
  };
  snapshot: Uint8Array;
}): void {
  const sourceDb = props.db.$client.sqlite3.open_v2Sync(':memory:');
  try {
    const deserializeResult = props.db.$client.sqlite3.deserialize(
      sourceDb,
      'main',
      props.snapshot,
      props.snapshot.byteLength,
      props.snapshot.byteLength,
      1,
    );
    if (deserializeResult !== 0) {
      throw new Error(
        `sqlite3_deserialize failed with code ${deserializeResult}`,
      );
    }
    const backupResult = props.db.$client.sqlite3.backup(
      props.db.$client.db,
      'main',
      sourceDb,
      'main',
    );
    if (backupResult !== 0) {
      throw new Error(`sqlite3_backup failed with code ${backupResult}`);
    }
  } finally {
    props.db.$client.sqlite3.close(sourceDb);
  }
}

/**
 * Durable standalone aggregate session. Construction is synchronous and
 * acquires no browser resources. Commands execute locally without signatures,
 * WebSockets, backend admission, or a delivery callback.
 */
export function makeStandaloneSession<
  FRONTEND extends AuthoredAggregateFrontend,
  APP_SERVICES,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS extends APP_SERVICES | SessionRuntimeServices = never,
  MODELS extends IAnyModels = FRONTEND['models'],
>(props: {
  key: string;
  frontend: FRONTEND & { kind: 'aggregate'; models: MODELS };
  runtime: IZerospinRuntime<APP_SERVICES>;
  authentication: FRONTEND['authentication']['authenticationSchema']['Type'];
  resources?: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
  layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
}): IAggregateSession<
  FRONTEND & { systemName: typeof STANDALONE_SYSTEM_NAME }
> & {
  initialize(): Promise<void>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
};

export function makeStandaloneSession(props: unknown): unknown {
  const {
    key,
    frontend: authoredFrontend,
    runtime,
    authentication: fixtureAuthentication,
    resources: fixtureResources = {},
    layer = Layer.empty,
  } = props as {
    key: string;
    frontend: AuthoredAggregateFrontend & {
      kind: 'aggregate';
      models: IAnyModels;
    };
    runtime: IZerospinRuntime<any>;
    authentication: Readonly<Record<string, unknown>>;
    resources?: Partial<{
      [K in string]: readonly InferResource<IAnyModels[string]>[];
    }>;
    layer?: Layer.Layer<any, IAnyError, any>;
  };
  if (key === '') {
    throw new ZerospinError({
      code: 'standalone-session-key-invalid',
      message: 'Standalone session key must be nonempty',
    });
  }

  const frontend = {
    ...authoredFrontend,
    systemName: STANDALONE_SYSTEM_NAME,
  } as IAggregateFrontendController;
  const lifecycle = createLifecycle();
  const coreSession = makeAggregateSession({
    frontend,
  });
  let stagingExcluded = false;
  let resetInFlight: Promise<void> | null = null;
  let resetEpoch = 0;

  const runOwnedLifecycle = (options: {
    forceSeed: boolean;
  }): Promise<void> => {
    const admission = admitInitialization(lifecycle);
    return (async () => {
      if (admission.waitForCleanup !== null) {
        await admission.waitForCleanup;
      }
      if (lifecycle.attempt !== admission.attempt || !lifecycle.active) {
        return;
      }
      const sessionScope = admission.scope;
      let published = false;
      const ready = Promise.withResolvers<void>();

      const program = Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            coreSession.clearExecutionResources();
            coreSession.store.setState({
              sessionStatus: 'released',
              isInitialized: false,
              db: null,
              schema: null,
              models: null,
              sessionId: null,
              aggregateId: null,
              aggregateName: null,
              authentication: null,
              frontendName: null,
              aggregateFrontendLockKey: null,
              aggregateIndex: null,
              selectionIndex: null,
              selectionHash: null,
              pushIndex: null,
              backupState: { status: 'released', failure: null },
            });
          }),
        );

        const application = yield* runtime.contextEffect;
        return yield* Effect.gen(function* () {
          const models = frontend.models;
          const authentication = yield* Schema.encodeEffect(
            frontend.authentication.authenticationSchema,
          )(fixtureAuthentication).pipe(
            mapParseError({
              code: 'standalone-session-authentication-invalid',
              prefix: 'Invalid standalone authentication',
            }),
          );
          const aggregateId = yield* Schema.decodeUnknownEffect(
            makeAbbreviationIdSchema('acct'),
          )(authentication.aggregateId).pipe(
            mapParseError({
              code: 'standalone-session-aggregate-id-invalid',
              prefix: 'Invalid standalone aggregate ID',
            }),
          );
          const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
            makeFrontendControllerSpec(frontend).aggregateFrontendLock,
          );
          const backupKey = yield* makeStandaloneFrontendBackupKey({
            key,
            frontendName: frontend.name,
            frontendLockKey: aggregateFrontendLockKey,
          });
          const backup = yield* BrowserBackup;
          const backupWorker = yield* backup.claim({
            backupKey,
            session: coreSession,
          });
          const dbConfig = makeResourceDbConfig({
            models,
            otherTables: sessionRepoTables,
          });
          const db = yield* Effect.acquireRelease(
            makeProvisionedInMemoryWasmSqliteDb({ dbConfig }),
            acquiredDb =>
              makeAsync(
                () => acquiredDb.$client.sqlite3.close(acquiredDb.$client.db),
                ZerospinError.catch({
                  code: 'failed-to-close-standalone-session-database',
                  message: 'Failed to close standalone session database',
                }),
              ).pipe(Effect.asVoid, Effect.ignore),
          );
          const emptyDatabase = db.$client.sqlite3.serialize(
            db.$client.db,
            'main',
          );
          const expectedSchema = JSON.stringify(
            db.all<{ type: string; name: string; sql: string }>(
              sql`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`,
            ),
          );

          const acquireSignal = yield* Queue.unbounded<void>();
          let released = false;
          let forceSeed = options.forceSeed;
          let registeredSessionId: typeof coreSession.sessionId = null;
          let ownership: { revoked: boolean; scope: Scope.Closeable } | null =
            null;
          const events = new AbortController();
          // A hidden startup cannot publish; hiding a current owner does not revoke it.
          for (const event of ['visibilitychange', 'focus', 'pageshow']) {
            const target = event === 'visibilitychange' ? document : globalThis;
            target.addEventListener(
              event,
              () => {
                if (
                  released ||
                  coreSession.store.getState().sessionStatus === 'failed'
                )
                  return;
                if (document.visibilityState !== 'visible') {
                  if (
                    ownership !== null &&
                    coreSession.store.getState().sessionStatus ===
                      'bootstrapping'
                  ) {
                    ownership.revoked = true;
                    if (
                      coreSession.store.getState().sessionStatus !== 'failed'
                    ) {
                      coreSession.store.setState({
                        sessionStatus: 'superseded',
                      });
                    }
                    Effect.runFork(Scope.close(ownership.scope, Exit.void));
                  }
                  return;
                }
                if (Queue.sizeUnsafe(acquireSignal) === 0)
                  Queue.offerUnsafe(acquireSignal, undefined);
              },
              { signal: events.signal },
            );
          }
          const removeDisconnectListener = backupWorker.onDisconnect(() => {
            if (
              released ||
              coreSession.store.getState().sessionStatus === 'failed'
            )
              return;
            if (ownership !== null) {
              ownership.revoked = true;
              db.$client.onCommittedTransaction = null;
              Effect.runFork(Scope.close(ownership.scope, Exit.void));
            }
            coreSession.store.setState({
              sessionStatus: 'superseded',
              backupState: { status: 'pending', failure: null },
            });
            if (
              document.visibilityState === 'visible' &&
              Queue.sizeUnsafe(acquireSignal) === 0
            ) {
              Queue.offerUnsafe(acquireSignal, undefined);
            }
          });
          yield* Effect.addFinalizer(() =>
            Effect.gen(function* () {
              released = true;
              events.abort();
              removeDisconnectListener();
              db.$client.onCommittedTransaction = null;
              if (registeredSessionId !== null) {
                zerospinDevtoolsStore
                  .getState()
                  .removeAggregateSession(registeredSessionId);
              }
              if (ownership !== null) {
                ownership.revoked = true;
                yield* Scope.close(ownership.scope, Exit.void);
              }
            }),
          );
          if (document.visibilityState === 'visible')
            Queue.offerUnsafe(acquireSignal, undefined);

          for (;;) {
            yield* Queue.take(acquireSignal);
            if (
              released ||
              document.visibilityState !== 'visible' ||
              coreSession.store.getState().sessionStatus === 'failed' ||
              (published &&
                coreSession.store.getState().sessionStatus === 'current')
            )
              continue;
            if (ownership !== null) {
              ownership.revoked = true;
              yield* Scope.close(ownership.scope, Exit.void);
            }
            const period = { revoked: false, scope: yield* Scope.make() };
            ownership = period;
            coreSession.store.setState({
              sessionStatus: 'bootstrapping',
              backupState: { status: 'pending', failure: null },
            });
            const acquired = yield* Effect.gen(function* () {
              const acquisition = yield* backupWorker.acquireDb({
                backupKey,
                onRevoked: () => {
                  period.revoked = true;
                  if (ownership === period && !released) {
                    db.$client.onCommittedTransaction = null;
                    if (
                      coreSession.store.getState().sessionStatus !== 'failed'
                    ) {
                      coreSession.store.setState({
                        sessionStatus: 'superseded',
                      });
                    }
                    Effect.runFork(Scope.close(period.scope, Exit.void));
                  }
                },
              });
              const backupDb = acquisition.db;
              yield* Effect.addFinalizer(() =>
                backupDb.dispose().pipe(Effect.ignore),
              );
              if (
                period.revoked ||
                released ||
                document.visibilityState !== 'visible'
              )
                return;
              const selectedSnapshot =
                acquisition.status === 'acquired'
                  ? acquisition.snapshot
                  : yield* backupDb.exportSnapshot();
              if (
                period.revoked ||
                released ||
                document.visibilityState !== 'visible'
              )
                return;
              const sessionId = yield* makeIdFromAbbreviation({
                abbreviation: coreAbbreviations.session,
              });
              let restoredFromBackup = false;
              if (!forceSeed && selectedSnapshot !== null) {
                const previousSnapshot = db.$client.sqlite3.serialize(
                  db.$client.db,
                  'main',
                );
                const restored = yield* Effect.try({
                  try: () => {
                    restoreSnapshotIntoLiveDb({
                      db,
                      snapshot: selectedSnapshot,
                    });
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
                    const encodedAuthenticationSchema = Schema.toEncoded(
                      frontend.authentication.authenticationSchema,
                    );
                    const savedAuthentication = Schema.decodeUnknownSync(
                      Schema.fromJsonString(encodedAuthenticationSchema),
                    )(identityRows[0]?.authentication, {
                      onExcessProperty: 'error',
                    });
                    if (
                      !Schema.toEquivalence(encodedAuthenticationSchema)(
                        savedAuthentication,
                        authentication,
                      )
                    ) {
                      throw new ZerospinError({
                        code: 'standalone-authentication-mismatch',
                        message:
                          'Saved authentication differs; call reset() to replace this document',
                      });
                    }
                    if (
                      db.select().from(sessionMetadataDrizzleSchema).all()
                        .length !== 1
                    ) {
                      throw new Error(
                        'The backup must contain one current frontend metadata row',
                      );
                    }
                  },
                  catch: ZerospinError.catch({
                    code: 'standalone-backup-unreadable',
                    message:
                      'Standalone backup is unreadable or incompatible; call reset() to replace it',
                  }),
                }).pipe(Effect.result);
                if (Result.isFailure(restored)) {
                  // Preserve both the saved backup and the last readable local state.
                  restoreSnapshotIntoLiveDb({
                    db,
                    snapshot: previousSnapshot,
                  });
                  return yield* restored.failure;
                }
                restoredFromBackup = true;
              }

              if (!restoredFromBackup) {
                restoreSnapshotIntoLiveDb({
                  db,
                  snapshot: emptyDatabase,
                });
                const resources = yield* encodeFixtureResources({
                  models,
                  resources: fixtureResources,
                });
                yield* applyAggregateFrontendSnapshot({
                  db,
                  frontend,
                  sessionId,
                  aggregateId,
                  authentication,
                  snapshot: {
                    aggregateId,
                    aggregateName: frontend.aggregateName,
                    authentication: fixtureAuthentication,
                    aggregateIndex: 0,
                    selectionIndex: 0,
                    selectionHash: SELECTION_GENESIS_HASH,
                    frontendName: frontend.name,
                    aggregateVersion: frontend.aggregateVersion,
                    selectedCommands: [],
                    resources,
                  },
                  models,
                });
                db.run(
                  sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL, authentication TEXT)`,
                );
                db.run(
                  sql`INSERT INTO __zerospin_backup_identity (backupKey, authentication) VALUES (${backupKey}, ${JSON.stringify(authentication)})`,
                );
              } else {
                db.update(sessionMetadataDrizzleSchema)
                  .set({ sessionId, nextSessionIndex: 1 })
                  .run();
              }

              const guards = yield* initializeFrontendGuards({
                frontend: frontend as IAnyAggregateFrontendController,
                layer,
              });
              coreSession.setExecutionResources({
                sessionId,
                settleLocally: true,
                guards,
                runtime,
              });

              const transactionQueue =
                yield* Queue.unbounded<readonly ICommittedSqlStatement[]>();
              let backupAccepting = true;
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  backupAccepting = false;
                  if (ownership === period)
                    db.$client.onCommittedTransaction = null;
                }),
              );
              let backupEpoch = 0;
              const backupSemaphore = yield* Semaphore.make(1);

              const repairBackup = Effect.gen(function* () {
                backupAccepting = false;
                backupEpoch += 1;
                coreSession.store.setState({
                  backupState: { status: 'repairing', failure: null },
                });
                const afterSnapshot: (readonly ICommittedSqlStatement[])[] = [];
                db.$client.onCommittedTransaction = statements => {
                  if (!period.revoked && !released && !stagingExcluded)
                    afterSnapshot.push(statements);
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
                    while: error => error.code === 'backup-request-uncertain',
                  }),
                );
                db.$client.onCommittedTransaction = statements => {
                  if (
                    backupAccepting &&
                    !period.revoked &&
                    !released &&
                    !stagingExcluded
                  ) {
                    coreSession.store.setState({
                      backupState: { status: 'pending', failure: null },
                    });
                    Queue.offerUnsafe(transactionQueue, statements);
                  }
                };
                for (const statements of afterSnapshot) {
                  Queue.offerUnsafe(transactionQueue, statements);
                }
                if (period.revoked || released) return;
                backupAccepting = true;
                coreSession.store.setState({
                  backupState: {
                    status: afterSnapshot.length === 0 ? 'ready' : 'pending',
                    failure: null,
                  },
                });
              });

              db.$client.onCommittedTransaction = statements => {
                if (
                  backupAccepting &&
                  !period.revoked &&
                  !released &&
                  !stagingExcluded
                ) {
                  coreSession.store.setState({
                    backupState: { status: 'pending', failure: null },
                  });
                  Queue.offerUnsafe(transactionQueue, statements);
                }
              };

              if (!restoredFromBackup) {
                yield* repairBackup;
                forceSeed = false;
              } else {
                while (Queue.sizeUnsafe(transactionQueue) > 0) {
                  const statements = yield* Queue.take(transactionQueue);
                  yield* backupDb
                    .applyStatements({ statements })
                    .pipe(
                      Effect.catch(error =>
                        error.code === 'backup-request-uncertain'
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
                    if (!backupAccepting || stagingExcluded) return;
                    yield* backupSemaphore
                      .withPermits(1)(
                        Effect.gen(function* () {
                          if (
                            !backupAccepting ||
                            stagingExcluded ||
                            statementEpoch !== backupEpoch
                          ) {
                            return;
                          }
                          const applied = yield* backupDb
                            .applyStatements({ statements })
                            .pipe(Effect.result);
                          if (Result.isFailure(applied)) {
                            if (
                              applied.failure.code !==
                              'backup-request-uncertain'
                            ) {
                              return yield* applied.failure;
                            }
                            yield* repairBackup;
                          } else if (Queue.sizeUnsafe(transactionQueue) === 0) {
                            coreSession.store.setState({
                              backupState: { status: 'ready', failure: null },
                            });
                          }
                        }),
                      )
                      .pipe(
                        Effect.catch(error =>
                          Effect.sync(() => {
                            if (period.revoked || released) return;
                            backupAccepting = false;
                            db.$client.onCommittedTransaction = null;
                            coreSession.store.setState({
                              sessionStatus: 'failed',
                              backupState: {
                                status: 'failed',
                                failure: Schema.encodeSync(
                                  ZerospinError.schema,
                                )(error) as IAnyErrorJson,
                              },
                            });
                          }),
                        ),
                      );
                  }),
                ),
              );

              if (
                period.revoked ||
                released ||
                document.visibilityState !== 'visible'
              )
                return;
              const metadata = db
                .select()
                .from(sessionMetadataDrizzleSchema)
                .all()[0];
              if (metadata === undefined) {
                return yield* new ZerospinError({
                  code: 'standalone-session-metadata-missing',
                  message: 'Standalone session metadata was not installed',
                });
              }

              coreSession.store.setState({
                aggregateId,
                aggregateName: frontend.aggregateName,
                authentication: Schema.decodeUnknownSync(
                  frontend.authentication.authenticationSchema,
                )(authentication),
                db,
                aggregateIndex: metadata.aggregateIndex,
                selectionIndex: metadata.selectionIndex,
                selectionHash: metadata.selectionHash,
                pushIndex: metadata.pushIndex,
                frontendName: frontend.name,
                aggregateFrontendLockKey,
                isInitialized: true,
                models,
                schema: dbConfig.schema,
                sessionId,
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

              if (registeredSessionId !== null) {
                zerospinDevtoolsStore
                  .getState()
                  .removeAggregateSession(registeredSessionId);
              }
              zerospinDevtoolsStore
                .getState()
                .addAggregateSession({ session: coreSession });
              registeredSessionId = sessionId;
              published = true;
              ready.resolve();
            }).pipe(Scope.provide(period.scope), Effect.result);
            if (
              period.revoked ||
              released ||
              document.visibilityState !== 'visible'
            ) {
              yield* Scope.close(period.scope, Exit.void);
              continue;
            }
            if (Result.isFailure(acquired)) {
              yield* Scope.close(period.scope, Exit.void);
              if (!published) return yield* acquired.failure;
              coreSession.store.setState({
                sessionStatus: 'failed',
                backupState: {
                  status: 'failed',
                  failure: Schema.encodeSync(ZerospinError.schema)(
                    acquired.failure,
                  ),
                },
              });
            }
          }
        }).pipe(Effect.provideContext(application));
      }).pipe(Scope.provide(sessionScope));

      const fiber = runtime.runFork(
        program.pipe(
          Effect.catchCause(cause =>
            Effect.sync(() => {
              const failure = ZerospinError.catch({
                code: 'standalone-session-failed',
                message: 'Standalone session lifecycle failed',
              })(Cause.squash(cause));
              if (published && lifecycle.active) {
                coreSession.store.setState({
                  sessionStatus: 'failed',
                  backupState: {
                    status: 'failed',
                    failure: Schema.encodeSync(ZerospinError.schema)(failure),
                  },
                });
              }
              ready.reject(failure);
            }),
          ),
        ),
      );
      lifecycle.fiber = fiber;
      Effect.runSync(Scope.addFinalizer(sessionScope, Fiber.interrupt(fiber)));

      try {
        await ready.promise;
        if (!published || !coreSession.store.getState().isInitialized) {
          await beginCleanup(lifecycle, admission.attempt, sessionScope);
          throw new ZerospinError({
            code: 'standalone-session-not-ready',
            message:
              'Standalone session initialization ended without publishing readiness',
          });
        }
      } catch (error) {
        await beginCleanup(lifecycle, admission.attempt, sessionScope);
        throw error;
      }
    })();
  };

  const initialize = (): Promise<void> => {
    if (resetInFlight !== null) {
      throw new ZerospinError({
        code: 'frontend-already-mounted',
        message: 'Session reset owns initialization',
      });
    }
    return runOwnedLifecycle({ forceSeed: false });
  };

  const reset = async (): Promise<void> => {
    if (resetInFlight !== null) {
      return resetInFlight;
    }
    const epoch = ++resetEpoch;
    resetInFlight = (async () => {
      stagingExcluded = true;
      try {
        // Exclude staging for any still-mounted store while replacing.
        if (coreSession.store.getState().isInitialized) {
          coreSession.store.setState({ sessionStatus: 'bootstrapping' });
        }
        if (lifecycle.scope !== null) {
          await beginCleanup(lifecycle, lifecycle.attempt, lifecycle.scope);
        }
        if (resetEpoch === epoch) await runOwnedLifecycle({ forceSeed: true });
      } finally {
        stagingExcluded = false;
        resetInFlight = null;
      }
    })();
    return resetInFlight;
  };

  const dispose = async () => {
    resetEpoch += 1;
    if (lifecycle.scope === null) {
      return lifecycle.cleanup ?? Promise.resolve();
    }
    return beginCleanup(lifecycle, lifecycle.attempt, lifecycle.scope);
  };

  return Object.assign(coreSession, {
    initialize,
    reset,
    dispose,
  });
}
