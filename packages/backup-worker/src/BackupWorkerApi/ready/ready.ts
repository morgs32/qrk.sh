import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BackupWorkerApi } from '../BackupWorkerApi.ts';

export const ready = Effect.fn('BackupWorkerApi.ready')(function* (props: {
  api: BackupWorkerApi;
}) {
  const { api } = props;
  yield* Effect.tryPromise({
    try: () => api.runtime,
    catch: catchZerospinError({
      code: 'backup-worker-unavailable',
      message: 'Failed to initialize IndexedDB backup storage',
    }),
  });
  if (api.disposed) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'backup-worker-closed',
        message: 'Backup connection is closed',
      }),
    );
  }
});
