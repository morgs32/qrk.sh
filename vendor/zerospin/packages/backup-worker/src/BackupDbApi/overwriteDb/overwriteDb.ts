import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import { copySqliteDatabase } from '../../copySqliteDatabase/copySqliteDatabase.ts';
import type { BackupDbApi } from '../BackupDbApi.ts';

export const overwriteDb = Effect.fn('BackupDbApi.overwriteDb')(
  function* (props: { api: BackupDbApi; snapshot: Uint8Array }) {
    const { api, snapshot } = props;
    return yield* api.runtime.semaphore.withPermits(1)(
      Effect.tryPromise({
        try: async () => {
          if (
            api.revoked ||
            api.owner.disposed ||
            api.runtime.current.get(api.backupKey) !== api
          ) {
            throw new ZerospinError({
              code: 'backup-db-revoked',
              message: 'Backup ownership was revoked',
            });
          }
          const destination = api.runtime.handles.get(api.backupKey);
          if (destination === undefined) {
            throw new Error('Backup database has not been opened');
          }
          const { sqlite3, module } = api.runtime;
          const source = await sqlite3.open_v2(':memory:');
          let data = 0;
          let schema = 0;
          try {
            if (snapshot.byteLength < 100) {
              throw new Error('Invalid SQLite snapshot');
            }
            data = module._sqlite3_malloc(snapshot.byteLength);
            if (data === 0) {
              throw new Error('Failed to allocate snapshot memory');
            }
            module.HEAPU8.set(snapshot, data);
            schema = module._sqlite3_malloc(5);
            module.HEAPU8.set(new Uint8Array([109, 97, 105, 110, 0]), schema);
            const result = module._sqlite3_deserialize(
              source,
              schema,
              data,
              snapshot.byteLength,
              0,
              snapshot.byteLength,
              0,
              3,
            );
            if (result !== SQLite.SQLITE_OK) {
              throw new Error(`sqlite3_deserialize failed with code ${result}`);
            }
            data = 0; // SQLite owns the deserialized allocation after success.
            await Effect.runPromise(
              copySqliteDatabase({
                destinationDb: destination,
                sourceDb: source,
                module,
              }),
            );
          } finally {
            if (data) module._sqlite3_free(data);
            if (schema) module._sqlite3_free(schema);
            await sqlite3.close(source);
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : ZerospinError.catch({
                code: 'backup-db-overwrite-failed',
                message: 'Failed to overwrite IndexedDB backup',
              })(cause),
      }).pipe(Effect.uninterruptible),
    );
  },
);
