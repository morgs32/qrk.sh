import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BackupDbApi } from '../BackupDbApi.ts';

export const dispose = Effect.fn('BackupDbApi.dispose')(function* (props: {
  api: BackupDbApi;
}) {
  const { api } = props;
  api.revoked = true;
  api.onRevoked[Symbol.dispose]();
  const retained = api.owner.targets.get(api.backupKey);
  if (retained?.target === api) {
    api.owner.targets.delete(api.backupKey);
    retained.stub[Symbol.dispose]();
  }
  yield* api.runtime.semaphore.withPermits(1)(
    Effect.tryPromise({
      try: async () => {
        // An expired target owns neither the successor's handle nor its map entry.
        if (api.runtime.current.get(api.backupKey) !== api) return;
        api.runtime.current.delete(api.backupKey);
        const db = api.runtime.handles.get(api.backupKey);
        api.runtime.handles.delete(api.backupKey);
        if (db !== undefined) await api.runtime.sqlite3.close(db);
      },
      catch: ZerospinError.catch({
        code: 'backup-db-close-failed',
        message: 'Failed to close IndexedDB backup',
      }),
    }).pipe(Effect.uninterruptible),
  );
});
