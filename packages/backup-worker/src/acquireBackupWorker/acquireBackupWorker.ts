import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  catchZerospinError,
  isZerospinError,
  ZerospinErrorJsonSchema,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';
import { Effect, Schema, type Scope } from 'effect';

import type { BackupDbApi } from '../BackupDbApi/BackupDbApi.ts';
import type { BackupWorkerApi } from '../BackupWorkerApi/BackupWorkerApi.ts';

export type IBackupDb = Readonly<{
  overwriteDb(props: {
    snapshot: Uint8Array;
  }): Effect.Effect<void, IAnyError | IZerospinErrorJson>;
  applyStatements(props: {
    statements: readonly ICommittedSqlStatement[];
  }): Effect.Effect<void, IAnyError | IZerospinErrorJson>;
  exportSnapshot(): Effect.Effect<
    Uint8Array | null,
    IAnyError | IZerospinErrorJson
  >;
  dispose(): Effect.Effect<void, IAnyError | IZerospinErrorJson>;
}>;

export type IBackupWorker = Readonly<{
  acquireDb(props: {
    backupKey: string;
    onRevoked(): void;
  }): Effect.Effect<
    | { status: 'current'; db: IBackupDb }
    | { status: 'acquired'; db: IBackupDb; snapshot: Uint8Array | null },
    IAnyError | IZerospinErrorJson
  >;
  onDisconnect(listener: () => void): () => void;
}>;

/** One scoped connection; connection loss invalidates its capabilities without replaying SQL. */
export const acquireBackupWorker = Effect.fn('acquireBackupWorker')(
  function* (): Effect.fn.Return<IBackupWorker, IAnyError, Scope.Scope> {
    if (
      typeof globalThis.SharedWorker !== 'function' ||
      typeof globalThis.MessagePort !== 'function' ||
      typeof navigator.locks?.request !== 'function'
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'backup-worker-unavailable',
          message:
            'SharedWorker and Web Locks are required for browser backups',
        }),
      );
    }
    const resource = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          let closed = false;
          let generation = 0;
          const listeners = new Set<() => void>();
          const databases = new Map<string, IBackupDb>();
          let connection:
            | {
                generation: number;
                port: MessagePort;
                api: RpcStub<BackupWorkerApi>;
                ready: Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
                lost: PromiseWithResolvers<never>;
                abort: AbortController;
              }
            | undefined;

          const replaceConnection = (expected: number) => {
            const previous = connection;
            if (closed || previous?.generation !== expected) return;
            connection = undefined;
            generation += 1;
            previous.abort.abort();
            previous.lost.reject(
              new Error('Backup worker connection was lost'),
            );
            previous.api[Symbol.dispose]();
            previous.port.close();
            databases.clear();
            openConnection();
            for (const listener of listeners) listener();
          };
          const openConnection = () => {
            const worker = new SharedWorker('/__zerospin/backup-worker.js', {
              name: 'zerospin-backups',
              type: 'module',
            });
            const port = worker.port;
            const api = newMessagePortRpcSession<BackupWorkerApi>(port);
            const abort = new AbortController();
            const lost = Promise.withResolvers<never>();
            void lost.promise.catch(() => undefined);
            const ready = Promise.resolve(api.ready());
            const current = { generation, port, api, ready, lost, abort };
            connection = current;
            const replace = () => replaceConnection(current.generation);
            api.onRpcBroken(replace);
            worker.addEventListener('error', replace, { once: true });
            port.addEventListener('messageerror', replace, { once: true });
            port.start();
            void ready
              .then(async result => {
                if (
                  result.result._tag !== 'Success' ||
                  closed ||
                  connection !== current
                ) {
                  return;
                }
                // Observe only after ready proves the worker already holds the exclusive lock.
                await navigator.locks.request(
                  'zerospin-backups-lifetime',
                  { mode: 'shared', signal: abort.signal },
                  replace,
                );
              })
              .catch(cause => {
                if (
                  !(
                    cause instanceof DOMException && cause.name === 'AbortError'
                  ) &&
                  connection === current
                ) {
                  replace();
                }
              });
          };
          openConnection();
          const worker: IBackupWorker = {
            onDisconnect(listener) {
              listeners.add(listener);
              return () => {
                listeners.delete(listener);
              };
            },
            acquireDb: Effect.fn('acquireBackupWorker.acquireDb')(
              function* (props: { backupKey: string; onRevoked(): void }) {
                const { backupKey, onRevoked } = props;
                const current = connection;
                if (closed || !current) {
                  return yield* Effect.fail(
                    makeZerospinError({
                      code: 'backup-worker-closed',
                      message: 'Backup connection is closed',
                    }),
                  );
                }
                yield* Effect.tryPromise({
                  try: () =>
                    Promise.race([current.ready, current.lost.promise]),
                  catch: catchZerospinError({
                    code: 'backup-request-uncertain',
                    message: 'Backup worker readiness was interrupted',
                  }),
                }).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
                let revoked = false;
                const callback = new RpcStub(() => {
                  revoked = true;
                  if (connection === current && !closed) onRevoked();
                });
                return yield* Effect.tryPromise({
                  try: async signal => {
                    try {
                      using reply = await Promise.race([
                        current.api.acquireDb({
                          backupKey,
                          onRevoked: callback,
                        }),
                        current.lost.promise,
                      ]);
                      if (reply.result._tag === 'Failure') {
                        throw makeZerospinError(reply.result.failure);
                      }
                      const result = reply.result.success;
                      if (
                        signal.aborted ||
                        closed ||
                        connection !== current ||
                        revoked
                      ) {
                        if (result.status === 'acquired') {
                          await result.db.dispose();
                        }
                        throw makeZerospinError({
                          code: 'backup-db-revoked',
                          message: 'Backup acquisition is no longer current',
                        });
                      }
                      if (result.status === 'current') {
                        const existing = databases.get(backupKey);
                        if (!existing) {
                          throw new Error(
                            'Current backup capability is missing',
                          );
                        }
                        return { status: 'current', db: existing } satisfies {
                          status: 'current';
                          db: IBackupDb;
                        };
                      }
                      const stub: RpcStub<BackupDbApi> = result.db.dup();
                      let disposed = false;
                      // This shared wire boundary supplies generation checks and uncertainty classification.
                      const call = <T>(
                        invoke: () => PromiseLike<
                          IRpcEnvelope<T, IZerospinErrorJson>
                        >,
                      ) =>
                        Effect.suspend(() => {
                          if (disposed || revoked) {
                            return Effect.fail(
                              makeZerospinError({
                                code: 'backup-db-revoked',
                                message: 'Backup ownership was revoked',
                              }),
                            );
                          }
                          if (closed || connection !== current) {
                            return Effect.fail(
                              makeZerospinError({
                                code: 'backup-request-uncertain',
                                message:
                                  'Backup worker connection was replaced',
                              }),
                            );
                          }
                          return Effect.tryPromise({
                            try: () =>
                              Promise.race([invoke(), current.lost.promise]),
                            catch: catchZerospinError({
                              code: 'backup-request-uncertain',
                              message:
                                'Dispatched backup operation has an uncertain result',
                            }),
                          }).pipe(
                            Effect.flatMap(
                              (
                                reply,
                              ): Effect.Effect<
                                T,
                                IAnyError | IZerospinErrorJson
                              > =>
                                connection === current && !closed
                                  ? readRpcEnvelope(reply)
                                  : Effect.fail(
                                      makeZerospinError({
                                        code: 'backup-request-uncertain',
                                        message:
                                          'Backup reply belongs to a replaced connection',
                                      }),
                                    ),
                            ),
                          );
                        });
                      const db: IBackupDb = {
                        overwriteDb: props =>
                          call(() => stub.overwriteDb(props)),
                        applyStatements: props =>
                          call(() => stub.applyStatements(props)),
                        exportSnapshot: () => call(() => stub.exportSnapshot()),
                        dispose: () =>
                          Effect.gen(function* () {
                            if (disposed) return;
                            disposed = true;
                            if (databases.get(backupKey) === db) {
                              databases.delete(backupKey);
                            }
                            if (connection !== current || closed) return;
                            yield* Effect.tryPromise({
                              try: () =>
                                Promise.race([
                                  stub.dispose(),
                                  current.lost.promise,
                                ]),
                              catch: catchZerospinError({
                                code: 'backup-request-uncertain',
                                message: 'Backup disposal was interrupted',
                              }),
                            }).pipe(
                              Effect.flatMap(
                                (
                                  reply,
                                ): Effect.Effect<
                                  void,
                                  IAnyError | IZerospinErrorJson
                                > =>
                                  connection === current && !closed
                                    ? readRpcEnvelope(reply)
                                    : Effect.fail(
                                        makeZerospinError({
                                          code: 'backup-request-uncertain',
                                          message:
                                            'Backup reply belongs to a replaced connection',
                                        }),
                                      ),
                              ),
                            );
                          }).pipe(
                            Effect.ensuring(
                              Effect.sync(() => stub[Symbol.dispose]()),
                            ),
                          ),
                      };
                      databases.set(backupKey, db);
                      return {
                        status: 'acquired',
                        db,
                        snapshot: result.snapshot,
                      } satisfies {
                        status: 'acquired';
                        db: IBackupDb;
                        snapshot: Uint8Array | null;
                      };
                    } finally {
                      callback[Symbol.dispose]();
                    }
                  },
                  catch: cause =>
                    isZerospinError(cause) ||
                    Schema.is(ZerospinErrorJsonSchema)(cause)
                      ? cause
                      : catchZerospinError({
                          code: 'backup-request-uncertain',
                          message: 'Backup acquisition was interrupted',
                        })(cause),
                });
              },
            ),
          };
          return {
            worker,
            close() {
              closed = true;
              const previous = connection;
              connection = undefined;
              previous?.abort.abort();
              previous?.lost.reject(new Error('Backup page scope closed'));
              previous?.api[Symbol.dispose]();
              previous?.port.close();
              databases.clear();
              listeners.clear();
            },
          };
        },
        catch: catchZerospinError({
          code: 'backup-worker-unavailable',
          message: 'Failed to open the backup SharedWorker',
        }),
      }),
      resource => Effect.sync(() => resource.close()),
    );
    return resource.worker;
  },
);
