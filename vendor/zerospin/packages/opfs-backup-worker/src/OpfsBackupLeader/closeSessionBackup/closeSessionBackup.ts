import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const closeSessionBackup = Effect.fn(
  'OpfsBackupLeaderApi.closeSessionBackup',
)(function* (props: {
  api: OpfsBackupLeaderApi;
  backupClientId: number;
  backupKey: string;
  sessionId: ISessionId;
}) {
  return yield* props.api.semaphore.withPermits(1)(
    Effect.tryPromise({
      try: async () => {
        const key = JSON.stringify([props.backupKey, props.sessionId]);
        const handle = props.api.handles.get(key);
        if (
          handle === undefined ||
          handle.backupClientId !== props.backupClientId
        ) {
          return;
        }
        props.api.handles.delete(key);
        try {
          await props.api.sqlite3.close(handle.db);
        } finally {
          handle.releaseLock();
        }
      },
      catch: ZerospinError.catch({
        code: 'opfs-backup-close-failed',
        message: 'Failed to close OPFS session backup',
      }),
    }),
  );
});
