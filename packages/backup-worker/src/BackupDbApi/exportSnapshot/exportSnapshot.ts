import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import { copySqliteDatabase } from '../../copySqliteDatabase/copySqliteDatabase.ts';
import type { BackupDbApi } from '../BackupDbApi.ts';

export const exportSnapshot = Effect.fn('BackupDbApi.exportSnapshot')(
  function* (props: { api: BackupDbApi }) {
    const { api } = props;
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
          const { sqlite3, module } = api.runtime;
          let db = api.runtime.handles.get(api.backupKey);
          if (db === undefined) {
            db = await sqlite3.open_v2(
              api.backupKey,
              SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
              'zerospin-backups-idb-v1',
            );
            api.runtime.handles.set(api.backupKey, db);
            // IDBBatchAtomicVFS maps FULL to strict IndexedDB transactions and awaits durable commits.
            await sqlite3.exec(db, 'PRAGMA synchronous=FULL');
          }
          let present = false;
          await sqlite3.exec(db, 'SELECT 1 FROM sqlite_schema LIMIT 1', () => {
            present = true;
          });
          if (!present) return null;
          const memory = await sqlite3.open_v2(':memory:');
          let schema = 0;
          let size = 0;
          let bytes = 0;
          try {
            await Effect.runPromise(
              copySqliteDatabase({
                destinationDb: memory,
                sourceDb: db,
                module,
              }),
            );
            schema = module._sqlite3_malloc(5);
            module.HEAPU8.set(new Uint8Array([109, 97, 105, 110, 0]), schema);
            size = module._sqlite3_malloc(8);
            module.HEAPU32[size >>> 2] = 0;
            module.HEAPU32[(size >>> 2) + 1] = 0;
            bytes = module._sqlite3_serialize(memory, schema, size, 0);
            if (bytes === 0) throw new Error('sqlite3_serialize failed');
            if (module.HEAPU32[(size >>> 2) + 1] !== 0) {
              throw new Error('SQLite snapshot exceeds Uint8Array capacity');
            }
            return module.HEAPU8.slice(
              bytes,
              bytes + (module.HEAPU32[size >>> 2] ?? 0),
            );
          } finally {
            if (bytes) module._sqlite3_free(bytes);
            if (size) module._sqlite3_free(size);
            if (schema) module._sqlite3_free(schema);
            await sqlite3.close(memory);
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : ZerospinError.catch({
                code: 'backup-db-export-failed',
                message: 'Failed to export IndexedDB backup',
              })(cause),
      }).pipe(Effect.uninterruptible),
    );
  },
);
