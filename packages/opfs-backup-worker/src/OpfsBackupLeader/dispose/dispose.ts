import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const dispose = Effect.fn('OpfsBackupLeaderApi.dispose')(
  function* (props: { api: OpfsBackupLeaderApi }) {
    yield* props.api.semaphore.withPermits(1)(
      Effect.promise(async () => {
        for (const [key, handle] of props.api.handles) {
          props.api.handles.delete(key);
          try {
            await props.api.sqlite3.close(handle.db);
          } finally {
            handle.releaseLock();
          }
        }
      }),
    );
  },
);
