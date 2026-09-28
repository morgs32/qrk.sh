import { applyAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/applyAggregateSessionSnapshot/applyAggregateSessionSnapshot';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { AssertContractMutationsInModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import type { IAnyContracts } from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemoryWasmSqliteDb/makeProvisionedInMemoryWasmSqliteDb';
import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import type {
  IAnyModels,
  IAssertValidModels,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import { makeSessionDefinition } from '@zerospin/core/sessionDefinition/makeSessionDefinition';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  catchZerospinError,
  encodeError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeIdFromAbbreviation,
  type ITypeError,
} from '@zerospin/schema';
import { getTableName, sql } from 'drizzle-orm';
import {
  Cause,
  Effect,
  Exit,
  Layer,
  Queue,
  Result,
  Schema,
  Scope,
  Semaphore,
} from 'effect';

import { BrowserBackup } from '../BrowserBackup/BrowserBackup';
import { makeSessionLifecycle } from '../makeSessionLifecycle';
import { makeStandaloneSessionBackupKey } from '../makeStandaloneSessionBackupKey.ts';
import type {
  ISessionRuntimeServices,
  IZerospinRuntime,
} from '../sessionRuntime';

const SELECTION_GENESIS_HASH =
  '76e4e2d226c914c939d1f2b94550195f0dad064d8ca8d448a7101b458ced9ce0';

const STANDALONE_SYSTEM_NAME = 'standalone';

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
        return yield* Effect.fail(
          makeZerospinError({
            code: 'standalone-resource-model-not-found',
            message: `Standalone resource model ${firstResource.modelName} was not found`,
          }),
        );
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
 * acquires no browser resources. Commands execute locally without credentials,
 * WebSockets, backend admission, or a delivery callback.
 */
export function makeStandaloneSession<
  const AGGREGATE_NAME extends string,
  const AGGREGATE_VERSION extends string,
  const ACTOR_NAME extends string,
  const ACTOR_VERSION extends string,
  const SESSION_NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContracts,
  const CLAIMS extends IClaimsSchema,
  APP_LAYER extends Layer.Layer<never, IAnyError> = Layer.Layer<never>,
>(
  props: {
    kind: 'aggregate';
    aggregateName: AGGREGATE_NAME;
    aggregateVersion: AGGREGATE_VERSION;
    actorName: ACTOR_NAME;
    actorVersion: ACTOR_VERSION;
    sessionName: SESSION_NAME;
    claimsSchema: CLAIMS;
    models: MODELS & IAssertValidModels<NoInfer<MODELS>>;
    layer?: APP_LAYER;
    contracts: CONTRACTS & {
      [K in keyof CONTRACTS & string]: K extends CONTRACTS[K]['commandName']
        ? AssertContractMutationsInModels<CONTRACTS[K], NoInfer<MODELS>>
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
    claims: NoInfer<CLAIMS>['Type'];
    resources?: Partial<{
      [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
    }>;
    key: string;
  } & ([
    Exclude<
      NonNullable<
        IAggregateSessionDefinition<
          string,
          string,
          string,
          NoInfer<CONTRACTS>
        >['__initializeRequirements']
      >,
      ISessionRuntimeServices | Scope.Scope
    >,
  ] extends [never]
    ? unknown
    : {
        layer: Layer.Layer<
          Exclude<
            NonNullable<
              IAggregateSessionDefinition<
                string,
                string,
                string,
                NoInfer<CONTRACTS>
              >['__initializeRequirements']
            >,
            ISessionRuntimeServices | Scope.Scope
          >,
          IAnyError
        >;
      }),
): IAggregateSession<
  IAggregateSessionDefinition<
    typeof STANDALONE_SYSTEM_NAME,
    AGGREGATE_NAME,
    SESSION_NAME,
    CONTRACTS,
    MODELS,
    AGGREGATE_VERSION,
    CLAIMS
  > & { readonly actorName: ACTOR_NAME; readonly actorVersion: ACTOR_VERSION }
> & {
  readonly runtime: IZerospinRuntime<Layer.Success<APP_LAYER>>;
  readonly systemName: typeof STANDALONE_SYSTEM_NAME;
  initialize(): Promise<void>;
  reset(): Promise<void>;
  dispose(): Promise<void>;
};

export function makeStandaloneSession(props: unknown): unknown {
  const input = props as Parameters<typeof makeSessionDefinition>[0] & {
    key: string;
    layer?: Layer.Layer<unknown, IAnyError>;
    claims: Readonly<Record<string, unknown>>;
    resources?: Partial<
      Record<string, readonly InferResource<IAnyModels[string]>[]>
    >;
  };
  const {
    key,
    layer = Layer.empty,
    claims: fixtureClaims,
    resources: fixtureResources = {},
  } = input;
  if (key === '') {
    throw makeZerospinError({
      code: 'standalone-session-key-invalid',
      message: 'Standalone session key must be nonempty',
    });
  }
  const selected = makeSessionDefinition({
    ...input,
    systemName: STANDALONE_SYSTEM_NAME,
  });
  if (selected.kind !== 'aggregate') {
    throw new Error('Standalone sessions require an aggregate');
  }
  const definition = selected;
  const coreSession = makeAggregateSession({
    definition: {
      ...(definition as IAggregateSessionDefinition),
      systemName: STANDALONE_SYSTEM_NAME,
    },
  });
  let stagingExcluded = false;
  let resetInFlight: Promise<void> | null = null;
  let resetEpoch = 0;

  const lifecycle = makeSessionLifecycle({
    layer,
    infrastructure: BrowserBackup.layer,
    onDispose: () => {
      coreSession.clearExecutionResources();
      coreSession.store.setState({
        actorName: null,
        actorVersion: null,

        sessionStatus: 'released',
        isInitialized: false,
        db: null,
        schema: null,
        models: null,
        sessionId: null,
        aggregateId: null,
        aggregateName: null,
        claims: null,
        sessionName: null,
        aggregateSessionLockKey: null,
        aggregateIndex: null,
        executedIndex: null,
        executedHash: null,
        pushIndex: null,
        backupState: { status: 'released', failure: null },
      });
    },
  });
  const runOwnedLifecycle = (options: { forceSeed: boolean }): Promise<void> =>
    lifecycle.initialize(({ runtime, ready }) => {
      let published = false;
      return Effect.gen(function* () {
        const models = definition.models;
        const claims = yield* Schema.encodeEffect(definition.claimsSchema)(
          fixtureClaims,
        ).pipe(
          mapParseError({
            code: 'standalone-session-claims-invalid',
            prefix: 'Invalid standalone claims',
          }),
        );
        const aggregateId = yield* Schema.decodeUnknownEffect(
          makeAbbreviationIdSchema('acct'),
        )(claims.aggregateId).pipe(
          mapParseError({
            code: 'standalone-session-aggregate-id-invalid',
            prefix: 'Invalid standalone aggregate ID',
          }),
        );
        const aggregateSessionLockKey = yield* makeAggregateSessionLockKey(
          makeAggregateSessionSpec(definition).aggregateSessionLock,
        );
        const backupKey = yield* makeStandaloneSessionBackupKey({
          key,
          sessionName: definition.sessionName,
          sessionLockKey: aggregateSessionLockKey,
        });
        const backup = yield* BrowserBackup;
        const backupWorker = yield* backup.claim({
          backupKey,
          session: coreSession,
        });
        const dbConfig = makeResourceDbConfig({
          models,
          otherTables: sessionRepoDbConfig.tables,
        });
        const db = yield* Effect.acquireRelease(
          makeProvisionedInMemoryWasmSqliteDb({ dbConfig }),
          acquiredDb =>
            makeAsync(
              () => acquiredDb.$client.sqlite3.close(acquiredDb.$client.db),
              catchZerospinError({
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
              ) {
                return;
              }
              if (document.visibilityState !== 'visible') {
                if (
                  ownership !== null &&
                  coreSession.store.getState().sessionStatus === 'bootstrapping'
                ) {
                  ownership.revoked = true;
                  if (coreSession.store.getState().sessionStatus !== 'failed') {
                    coreSession.store.setState({
                      sessionStatus: 'superseded',
                    });
                  }
                  Effect.runFork(Scope.close(ownership.scope, Exit.void));
                }
                return;
              }
              if (Queue.sizeUnsafe(acquireSignal) === 0) {
                Queue.offerUnsafe(acquireSignal, undefined);
              }
            },
            { signal: events.signal },
          );
        }
        const removeDisconnectListener = backupWorker.onDisconnect(() => {
          if (
            released ||
            coreSession.store.getState().sessionStatus === 'failed'
          ) {
            return;
          }
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
        if (document.visibilityState === 'visible') {
          Queue.offerUnsafe(acquireSignal, undefined);
        }

        for (;;) {
          yield* Queue.take(acquireSignal);
          if (
            released ||
            document.visibilityState !== 'visible' ||
            coreSession.store.getState().sessionStatus === 'failed' ||
            (published &&
              coreSession.store.getState().sessionStatus === 'current')
          ) {
            continue;
          }
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
                  if (coreSession.store.getState().sessionStatus !== 'failed') {
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
            ) {
              return;
            }
            const selectedSnapshot =
              acquisition.status === 'acquired'
                ? acquisition.snapshot
                : yield* backupDb.exportSnapshot();
            if (
              period.revoked ||
              released ||
              document.visibilityState !== 'visible'
            ) {
              return;
            }
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
                      'The backup SQLite schema is incompatible with this definition',
                    );
                  }
                  const identityRows = db.all<{
                    backupKey: string;
                    claims: string;
                  }>(
                    sql`SELECT backupKey, claims FROM __zerospin_backup_identity`,
                  );
                  if (
                    identityRows.length !== 1 ||
                    identityRows[0]?.backupKey !== backupKey
                  ) {
                    throw new Error(
                      'The backup identity does not match this definition',
                    );
                  }
                  const encodedClaimsSchema = Schema.toEncoded(
                    definition.claimsSchema,
                  );
                  const savedClaims = Schema.decodeUnknownSync(
                    Schema.fromJsonString(encodedClaimsSchema),
                  )(identityRows[0]?.claims, {
                    onExcessProperty: 'error',
                  });
                  if (
                    !Schema.toEquivalence(encodedClaimsSchema)(
                      savedClaims,
                      claims,
                    )
                  ) {
                    throw makeZerospinError({
                      code: 'standalone-claims-mismatch',
                      message:
                        'Saved claims differ; call reset() to replace this document',
                    });
                  }
                  if (
                    db
                      .select()
                      .from(sessionRepoDbConfig.schema.sessionMetadata)
                      .all().length !== 1
                  ) {
                    throw new Error(
                      'The backup must contain one current definition metadata row',
                    );
                  }
                },
                catch: catchZerospinError({
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
                return yield* Effect.fail(restored.failure);
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
              yield* applyAggregateSessionSnapshot({
                db,
                definition,
                sessionId,
                aggregateId,
                claims,
                snapshot: {
                  actorName: definition.actorName,
                  actorVersion: definition.actorVersion,

                  aggregateId,
                  aggregateName: definition.aggregateName,
                  claims: fixtureClaims,
                  aggregateIndex: 0,
                  executedIndex: 0,
                  executedHash: SELECTION_GENESIS_HASH,
                  sessionName: definition.sessionName,
                  aggregateVersion: definition.aggregateVersion,
                  resolvedThrough: 0,
                  resources,
                },
                models,
              });
              db.run(
                sql`CREATE TABLE __zerospin_backup_identity (backupKey TEXT NOT NULL, claims TEXT)`,
              );
              db.run(
                sql`INSERT INTO __zerospin_backup_identity (backupKey, claims) VALUES (${backupKey}, ${JSON.stringify(claims)})`,
              );
            }
            coreSession.setExecutionResources({
              sessionId,
              settleLocally: true,
              runtime,
            });

            const transactionQueue =
              yield* Queue.unbounded<readonly ICommittedSqlStatement[]>();
            let backupAccepting = true;
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                backupAccepting = false;
                if (ownership === period) {
                  db.$client.onCommittedTransaction = null;
                }
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
                if (!period.revoked && !released && !stagingExcluded) {
                  afterSnapshot.push(statements);
                }
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
              // Persist the new session identity before commands can add metadata.
              db.update(sessionRepoDbConfig.schema.sessionMetadata)
                .set({ sessionId, nextSessionIndex: 1 })
                .run();
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
                            applied.failure.code !== 'backup-request-uncertain'
                          ) {
                            return yield* Effect.fail(applied.failure);
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
                              failure: Effect.runSync(encodeError(error)),
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
            ) {
              return;
            }
            const metadata = db
              .select()
              .from(sessionRepoDbConfig.schema.sessionMetadata)
              .all()[0];
            if (metadata === undefined) {
              return yield* Effect.fail(
                makeZerospinError({
                  code: 'standalone-session-metadata-missing',
                  message: 'Standalone session metadata was not installed',
                }),
              );
            }

            coreSession.store.setState({
              actorName: definition.actorName,
              actorVersion: definition.actorVersion,

              aggregateId,
              aggregateName: definition.aggregateName,
              claims: Schema.decodeUnknownSync(definition.claimsSchema)(claims),
              db,
              aggregateIndex: metadata.aggregateIndex,
              executedIndex: metadata.executedIndex,
              executedHash: metadata.executedHash,
              pushIndex: metadata.pushIndex,
              sessionName: definition.sessionName,
              aggregateSessionLockKey,
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
            ready();
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
            if (!published) return yield* Effect.fail(acquired.failure);
            coreSession.store.setState({
              sessionStatus: 'failed',
              backupState: {
                status: 'failed',
                failure: Effect.runSync(encodeError(acquired.failure)),
              },
            });
          }
        }
      }).pipe(
        Effect.catchCause(cause => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
          const failure = catchZerospinError({
            code: 'standalone-session-failed',
            message: 'Standalone session lifecycle failed',
          })(Cause.squash(cause));
          if (published) {
            coreSession.store.setState({
              sessionStatus: 'failed',
              backupState: {
                status: 'failed',
                failure: Effect.runSync(encodeError(failure)),
              },
            });
          }
          return Effect.fail(failure);
        }),
      );
    });

  const initialize = (): Promise<void> => {
    if (resetInFlight !== null) {
      throw makeZerospinError({
        code: 'session-already-mounted',
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
        await lifecycle.dispose();
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
    return lifecycle.dispose();
  };

  return Object.defineProperty(
    Object.assign(coreSession, {
      systemName: STANDALONE_SYSTEM_NAME,
      runtime: lifecycle.runtime,
      initialize,
      reset,
      dispose,
    }),
    'runtime',
    { enumerable: true, get: () => lifecycle.runtime },
  );
}
