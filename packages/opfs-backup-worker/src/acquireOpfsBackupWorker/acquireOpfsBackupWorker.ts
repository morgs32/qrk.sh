import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { ISessionId } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { newMessagePortRpcSession } from 'capnweb';
import { Effect, type Scope } from 'effect';

import type { IOpfsBackupControlMessage } from '../IOpfsBackupControlMessage.ts';
import type { OpfsBackupRouterApi } from '../OpfsBackupRouter/OpfsBackupRouterApi.ts';

export type IOpfsBackupWorker = Readonly<{
  listSessionBackups(props: {
    backupKey: string;
  }): Effect.Effect<readonly ISessionId[], IAnyError>;
  exportSnapshot(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Effect.Effect<Uint8Array | null, IAnyError>;
  replaceSnapshot(props: {
    backupKey: string;
    sessionId: ISessionId;
    snapshot: Uint8Array;
  }): Effect.Effect<void, IAnyError>;
  applyTransaction(props: {
    backupKey: string;
    sessionId: ISessionId;
    statements: readonly ICommittedSqlStatement[];
  }): Effect.Effect<void, IAnyError>;
  closeSessionBackup(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Effect.Effect<void, IAnyError>;
  deleteSessionBackup(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Effect.Effect<'deleted' | 'missing' | 'in-use', IAnyError>;
}>;

export const acquireOpfsBackupWorker = Effect.fn('acquireOpfsBackupWorker')(
  function* (): Effect.fn.Return<IOpfsBackupWorker, IAnyError, Scope.Scope> {
    if (
      typeof globalThis.SharedWorker !== 'function' ||
      typeof globalThis.Worker !== 'function' ||
      typeof globalThis.MessagePort !== 'function' ||
      typeof navigator.locks?.request !== 'function'
    ) {
      return yield* new ZerospinError({
        code: 'opfs-backup-worker-unavailable',
        message:
          'SharedWorker is not available; this browser is not compatible',
      });
    }

    return yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const routerAssetUrl = new URL(
            '../opfsBackupWorker.bundle.js',
            import.meta.url,
          );
          const leaderAssetUrl = new URL(
            '../opfsBackupLeader.bundle.js',
            import.meta.url,
          );
          const wasmAssetUrl = new URL(
            '../wa-sqlite.wasm',
            import.meta.url,
          );
          const leaderUrl =
            `${leaderAssetUrl.href}?wasmUrl=${encodeURIComponent(wasmAssetUrl.href)}` +
            '&entry=opfs-backup-leader';
          const graphName = routerAssetUrl.href;
          const routerUrl = `${routerAssetUrl.href}?graphName=${encodeURIComponent(graphName)}`;
          const leaderLockName = `zerospin:opfs-backup-leader:${graphName}`;
          const terminationLockName = `zerospin:opfs-backup-router:${graphName}`;
          let closed = false;
          let generation = 0;
          let connection:
            | Readonly<{
                api: ReturnType<
                  typeof newMessagePortRpcSession<OpfsBackupRouterApi>
                >;
                clientPort: MessagePort;
                controlPort: MessagePort;
                generation: number;
                leaderAbort: AbortController;
                leaderLifetime: PromiseWithResolvers<void>;
                readyTimeout: ReturnType<typeof setTimeout>;
                routerReady: PromiseWithResolvers<void>;
              }>
            | undefined;

          const replaceConnection = (expectedGeneration: number) => {
            if (
              closed ||
              connection === undefined ||
              connection.generation !== expectedGeneration
            ) {
              return;
            }
            connection.api[Symbol.dispose]();
            connection.clientPort.close();
            connection.controlPort.close();
            connection.leaderAbort.abort();
            connection.leaderLifetime.resolve();
            clearTimeout(connection.readyTimeout);
            connection.routerReady.reject(
              new Error('The OPFS backup mediator connection was replaced'),
            );
            generation += 1;
            openConnection(generation);
          };

          const openConnection = (connectionGeneration: number) => {
            const worker = new globalThis.SharedWorker(routerUrl, {
              name: 'zerospin:opfs-backup-router',
              type: 'module',
            });
            const controlPort = worker.port;
            const routerReady = Promise.withResolvers<void>();
            void routerReady.promise.catch(() => undefined);
            controlPort.addEventListener('message', event => {
              if (
                typeof event.data === 'object' &&
                event.data !== null &&
                'type' in event.data &&
                event.data.type === 'RouterReady'
              ) {
                if (connection?.generation === connectionGeneration) {
                  clearTimeout(connection.readyTimeout);
                }
                routerReady.resolve();
              }
            });
            controlPort.start();
            const clientChannel = new MessageChannel();
            const registration = {
              type: 'RegisterClient',
              port: clientChannel.port1,
            } satisfies IOpfsBackupControlMessage;
            controlPort.postMessage(registration, [clientChannel.port1]);
            clientChannel.port2.start();
            const api =
              newMessagePortRpcSession<OpfsBackupRouterApi>(clientChannel.port2);
            const leaderAbort = new AbortController();
            const leaderLifetime = Promise.withResolvers<void>();
            const readyTimeout = setTimeout(
              () => replaceConnection(connectionGeneration),
              1_000,
            );
            connection = {
              api,
              clientPort: clientChannel.port2,
              controlPort,
              generation: connectionGeneration,
              leaderAbort,
              leaderLifetime,
              readyTimeout,
              routerReady,
            };

            const replace = () => replaceConnection(connectionGeneration);
            controlPort.addEventListener('close', replace, { once: true });
            controlPort.addEventListener('messageerror', replace, {
              once: true,
            });
            clientChannel.port2.addEventListener('close', replace, {
              once: true,
            });
            clientChannel.port2.addEventListener('messageerror', replace, {
              once: true,
            });

            void routerReady.promise
              .then(async () => {
                if (
                  leaderAbort.signal.aborted ||
                  connection?.generation !== connectionGeneration
                ) {
                  return;
                }
                await navigator.locks.request(
                  terminationLockName,
                  { mode: 'shared', signal: leaderAbort.signal },
                  replace,
                );
              })
              .catch(cause => {
                if (
                  (!(cause instanceof DOMException) ||
                    cause.name !== 'AbortError') &&
                  connection?.generation === connectionGeneration
                ) {
                  replace();
                }
              });

            void navigator.locks
              .request(
                leaderLockName,
                { mode: 'exclusive', signal: leaderAbort.signal },
                async lock => {
                  if (
                    lock === null ||
                    closed ||
                    connection?.generation !== connectionGeneration
                  ) {
                    return;
                  }
                  const leader = new globalThis.Worker(leaderUrl, {
                    name: 'zerospin:opfs-backup-leader',
                    type: 'module',
                  });
                  const leaderChannel = new MessageChannel();
                  leader.postMessage(leaderChannel.port1, [leaderChannel.port1]);
                  const installation = {
                    type: 'InstallLeader',
                    port: leaderChannel.port2,
                  } satisfies IOpfsBackupControlMessage;
                  controlPort.postMessage(installation, [leaderChannel.port2]);
                  const failed = Promise.withResolvers<void>();
                  const shutdownComplete = Promise.withResolvers<void>();
                  leader.addEventListener('error', () => failed.resolve(), {
                    once: true,
                  });
                  leader.addEventListener('message', event => {
                    if (
                      typeof event.data === 'object' &&
                      event.data !== null &&
                      'type' in event.data &&
                      event.data.type === 'LeaderShutdownComplete'
                    ) {
                      shutdownComplete.resolve();
                    }
                  });
                  leader.addEventListener(
                    'messageerror',
                    () => failed.resolve(),
                    { once: true },
                  );
                  const endedBy = await Promise.race([
                    leaderLifetime.promise.then(() => 'leader-lifetime'),
                    failed.promise.then(() => 'worker-failed'),
                  ]);
                  if (endedBy === 'leader-lifetime') {
                    leader.postMessage({ type: 'ShutdownLeader' });
                    await Promise.race([
                      shutdownComplete.promise,
                      failed.promise,
                      new Promise<void>(resolve => setTimeout(resolve, 1_000)),
                    ]);
                  }
                  leader.terminate();
                  if (endedBy !== 'leader-lifetime') {
                    replaceConnection(connectionGeneration);
                  }
                },
              )
              .catch(cause => {
                if (
                  !(cause instanceof DOMException) ||
                  cause.name !== 'AbortError'
                ) {
                  replaceConnection(connectionGeneration);
                }
              });

          };

          openConnection(generation);
          const uncertain = (cause: unknown) => {
            const dispatchedGeneration = connection?.generation;
            if (dispatchedGeneration !== undefined) {
              replaceConnection(dispatchedGeneration);
            }
            const detail = ZerospinError.prettyUnknownFailure(cause);
            return new ZerospinError({
              code: 'opfs-backup-request-uncertain',
              message: `The OPFS backup mediator was lost after request dispatch: ${detail}`,
              cause: detail,
            });
          };

          return {
            close: () => {
              closed = true;
              if (connection === undefined) return;
              connection.api[Symbol.dispose]();
              connection.clientPort.close();
              connection.controlPort.close();
              connection.leaderAbort.abort();
              connection.leaderLifetime.resolve();
              clearTimeout(connection.readyTimeout);
              connection.routerReady.reject(
                new Error('The OPFS backup client was closed'),
              );
            },
            worker: {
              listSessionBackups: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<readonly ISessionId[], IAnyErrorJson>
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.listSessionBackups(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
              exportSnapshot: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<Uint8Array | null, IAnyErrorJson>
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.exportSnapshot(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
              replaceSnapshot: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<void, IAnyErrorJson>
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.replaceSnapshot(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
              applyTransaction: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<void, IAnyErrorJson>
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.applyTransaction(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
              closeSessionBackup: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<void, IAnyErrorJson>
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.closeSessionBackup(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
              deleteSessionBackup: props =>
                Effect.tryPromise({
                  try: async (): Promise<
                    IEncodedResult<
                      'deleted' | 'missing' | 'in-use',
                      IAnyErrorJson
                    >
                  > => {
                    const activeConnection = connection!;
                    await activeConnection.routerReady.promise;
                    return activeConnection.api.deleteSessionBackup(props);
                  },
                  catch: uncertain,
                }).pipe(Effect.flatMap(decodeRpc)),
            } satisfies IOpfsBackupWorker,
          };
        },
        catch: ZerospinError.catch({
          code: 'failed-to-connect-opfs-backup-worker',
          message: 'Failed to connect to the OPFS backup worker',
        }),
      }),
      connection => Effect.sync(connection.close),
    ).pipe(Effect.map(connection => connection.worker));
  },
);
