import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const releaseClient = Effect.fn('OpfsBackupLeaderApi.releaseClient')(
  function* (props: {
    api: OpfsBackupLeaderApi;
    backupClientId: number;
  }) {
    return yield* props.api.semaphore.withPermits(1)(
      Effect.tryPromise({
        try: async () => {
          for (const [key, handle] of props.api.handles) {
            if (handle.backupClientId !== props.backupClientId) continue;
            props.api.handles.delete(key);
            try {
              await props.api.sqlite3.close(handle.db);
            } finally {
              handle.releaseLock();
            }
          }
        },
        catch: ZerospinError.catch({
          code: 'opfs-backup-release-client-failed',
          message: 'Failed to release OPFS backup client',
        }),
      }),
    );
  },
);
