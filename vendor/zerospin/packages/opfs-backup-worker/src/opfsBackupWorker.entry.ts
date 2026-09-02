import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { newMessagePortRpcSession, type RpcStub } from 'capnweb';
import { Effect, Exit } from 'effect';

import type { IOpfsBackupControlMessage } from './IOpfsBackupControlMessage.ts';
import type { OpfsBackupLeaderApi } from './OpfsBackupLeader/OpfsBackupLeaderApi.ts';
import { OpfsBackupRouterApi } from './OpfsBackupRouter/OpfsBackupRouterApi.ts';

const workerUrl = new URL(globalThis.location.href);
const graphName = workerUrl.searchParams.get('graphName');
if (graphName === null) {
  throw new Error('OPFS backup router URL is missing graphName');
}
const terminationLockAcquired = Promise.withResolvers<void>();
void navigator.locks.request(
  `zerospin:opfs-backup-router:${graphName}`,
  { mode: 'exclusive', steal: true },
  () => {
    terminationLockAcquired.resolve();
    return new Promise(() => undefined);
  },
).catch(terminationLockAcquired.reject);

let nextBackupClientId = 1;
let currentLeader:
  | Readonly<{
      api: RpcStub<OpfsBackupLeaderApi>;
      hostControlPort: MessagePort;
      identity: object;
      rpcPort: MessagePort;
    }>
  | undefined;
let drainingPendingRequests = false;
const clients = new Set<number>();
const inFlightByClient = new Map<number, Set<Promise<void>>>();
const pendingRequests: Array<
  Readonly<{
    backupClientId: number;
    dispatch(leader: RpcStub<OpfsBackupLeaderApi>): void;
    reject(error: IAnyError): void;
  }>
> = [];

globalThis.addEventListener('connect', event => {
  if (!(event instanceof MessageEvent)) return;
  const controlPort = event.ports[0];
  if (!(controlPort instanceof MessagePort)) return;
  void terminationLockAcquired.promise.then(() => {
    controlPort.postMessage({ type: 'RouterReady' });
    controlPort.addEventListener('message', controlEvent => {
      const message = controlEvent.data as Partial<IOpfsBackupControlMessage>;
      if (
        message.type === 'RegisterClient' &&
        message.port instanceof MessagePort
      ) {
        const backupClientId = nextBackupClientId;
        nextBackupClientId += 1;
        clients.add(backupClientId);
        inFlightByClient.set(backupClientId, new Set());

        const api = new OpfsBackupRouterApi({
          backupClientId,
          routeRequest: request =>
            Effect.callback(resume => {
              let dispatched = false;
              const pending = {
                backupClientId,
                dispatch: (leader: RpcStub<OpfsBackupLeaderApi>) => {
                  if (!clients.has(backupClientId)) return;
                  dispatched = true;
                  const call = Effect.tryPromise({
                    try: () => request(leader),
                    catch: cause =>
                      new ZerospinError({
                        code: 'opfs-backup-request-uncertain',
                        message:
                          'The OPFS backup leader was lost after request dispatch',
                        cause: ZerospinError.prettyUnknownFailure(cause),
                      }),
                  }).pipe(Effect.flatMap(decodeRpc));
                  let tracked: Promise<void>;
                  tracked = Effect.runPromiseExit(call)
                    .then(exit => {
                      if (Exit.isSuccess(exit)) {
                        resume(Effect.succeed(exit.value));
                      } else {
                        resume(Effect.failCause(exit.cause));
                      }
                    })
                    .finally(() => {
                      inFlightByClient.get(backupClientId)?.delete(tracked);
                    });
                  inFlightByClient.get(backupClientId)?.add(tracked);
                },
                reject: (error: IAnyError) => resume(Effect.fail(error)),
              };

              if (
                currentLeader === undefined ||
                drainingPendingRequests
              ) {
                pendingRequests.push(pending);
              } else {
                pending.dispatch(currentLeader.api);
              }

              return Effect.sync(() => {
                if (dispatched) return;
                const index = pendingRequests.indexOf(pending);
                if (index !== -1) pendingRequests.splice(index, 1);
              });
            }),
          release: () =>
            Effect.promise(async () => {
              if (!clients.delete(backupClientId)) return;
              for (
                let index = pendingRequests.length - 1;
                index >= 0;
                index -= 1
              ) {
                const pending = pendingRequests[index];
                if (pending === undefined) continue;
                if (pending.backupClientId !== backupClientId) continue;
                pendingRequests.splice(index, 1);
                pending.reject(
                  new ZerospinError({
                    code: 'opfs-backup-request-uncertain',
                    message: 'The OPFS backup client disconnected',
                  }),
                );
              }

              await Promise.allSettled(
                inFlightByClient.get(backupClientId) ?? [],
              );
              inFlightByClient.delete(backupClientId);
              const leader = currentLeader;
              if (leader === undefined) return;
              try {
                await leader.api.releaseClient({ backupClientId });
              } catch {
                // The dispatched release is best-effort after client calls settle.
              }
            }),
        });

        newMessagePortRpcSession(message.port, api);
        message.port.start();
        const release = () => api[Symbol.dispose]();
        message.port.addEventListener('close', release, { once: true });
        message.port.addEventListener('messageerror', release, { once: true });
        return;
      }

      if (
        message.type === 'InstallLeader' &&
        message.port instanceof MessagePort
      ) {
        if (currentLeader !== undefined) {
          const staleLeader = currentLeader;
          currentLeader = undefined;
          staleLeader.api[Symbol.dispose]();
          staleLeader.rpcPort.close();
          staleLeader.hostControlPort.close();
        }

        const identity = {};
        const rpcPort = message.port;
        const api = newMessagePortRpcSession<OpfsBackupLeaderApi>(rpcPort);
        rpcPort.start();
        currentLeader = {
          api,
          hostControlPort: controlPort,
          identity,
          rpcPort,
        };

        const removeLeader = () => {
          if (currentLeader?.identity !== identity) return;
          currentLeader = undefined;
          api[Symbol.dispose]();
          rpcPort.close();
          controlPort.close();
        };
        rpcPort.addEventListener('close', removeLeader, { once: true });
        rpcPort.addEventListener('messageerror', removeLeader, { once: true });
        controlPort.addEventListener('close', removeLeader, { once: true });
        controlPort.addEventListener('messageerror', removeLeader, {
          once: true,
        });

        drainingPendingRequests = true;
        try {
          while (
            currentLeader?.identity === identity &&
            pendingRequests.length > 0
          ) {
            pendingRequests.shift()?.dispatch(api);
          }
        } finally {
          drainingPendingRequests = false;
        }
      }
    });
    controlPort.start();
  });
});
