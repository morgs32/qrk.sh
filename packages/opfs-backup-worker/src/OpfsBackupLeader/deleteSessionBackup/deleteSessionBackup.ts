import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const deleteSessionBackup = Effect.fn(
  'OpfsBackupLeaderApi.deleteSessionBackup',
)(function* (props: {
  api: OpfsBackupLeaderApi;
  backupClientId: number;
  backupKey: string;
  sessionId: ISessionId;
}) {
  return yield* Effect.tryPromise({
    try: async () => {
      if (!/^[a-f0-9]{64}$/.test(props.backupKey)) {
        throw new Error('Invalid OPFS backup key');
      }
      const key = JSON.stringify([props.backupKey, props.sessionId]);
      if (props.api.handles.has(key)) return 'in-use' as const;

      return navigator.locks.request(
        `zerospin:opfs:${props.backupKey}:${props.sessionId}`,
        { mode: 'exclusive', ifAvailable: true },
        async lock => {
          if (lock === null) return 'in-use' as const;
          return Effect.runPromise(
            props.api.semaphore.withPermits(1)(
              Effect.promise(async () => {
                if (props.api.handles.has(key)) return 'in-use' as const;
                try {
                  const root = await navigator.storage.getDirectory();
                  const zerospin = await root.getDirectoryHandle('zerospin');
                  const directory = await zerospin.getDirectoryHandle(
                    props.backupKey,
                  );
                  await directory.removeEntry(`${props.sessionId}.sqlite3`);
                  return 'deleted' as const;
                } catch (cause) {
                  if (
                    cause instanceof DOMException &&
                    cause.name === 'NotFoundError'
                  ) {
                    return 'missing' as const;
                  }
                  throw cause;
                }
              }),
            ),
          );
        },
      );
    },
    catch: ZerospinError.catch({
      code: 'opfs-backup-delete-failed',
      message: 'Failed to delete OPFS session backup',
    }),
  });
});
