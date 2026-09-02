import { acquireOpfsBackupWorker } from '@zerospin/opfs-backup-worker';
import { Effect } from 'effect';

const token = new URL(globalThis.location.href).searchParams.get('token');
const lifetime = Promise.withResolvers<void>();

globalThis.addEventListener('message', event => {
  if (event.data?.type === 'ReleaseOpfsLeaderFrame' && event.data.token === token) {
    lifetime.resolve();
  }
});

void Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      yield* acquireOpfsBackupWorker();
      while (true) {
        const locks = yield* Effect.promise(() => navigator.locks.query());
        if (
          locks.held?.some(lock =>
            lock.name?.startsWith('zerospin:opfs-backup-leader:'),
          ) === true
        ) {
          break;
        }
        yield* Effect.promise(
          () => new Promise<void>(resolve => setTimeout(resolve, 10)),
        );
      }
      globalThis.parent.postMessage({ type: 'OpfsLeaderFrameReady', token }, '*');
      yield* Effect.promise(() => lifetime.promise);
    }),
  ),
).catch(cause => {
  globalThis.parent.postMessage(
    {
      type: 'OpfsLeaderFrameFailed',
      token,
      cause: cause instanceof Error ? cause.message : String(cause),
    },
    '*',
  );
});
