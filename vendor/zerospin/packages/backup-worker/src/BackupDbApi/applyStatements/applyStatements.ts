import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { BackupDbApi } from '../BackupDbApi.ts';

export const applyStatements = Effect.fn('BackupDbApi.applyStatements')(
  function* (props: {
    api: BackupDbApi;
    statements: readonly ICommittedSqlStatement[];
  }) {
    const { api, statements } = props;
    // The validity check belongs inside the turn: a takeover revokes queued calls immediately.
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
          const db = api.runtime.handles.get(api.backupKey);
          if (db === undefined) {
            throw new Error('Backup database has not been opened');
          }
          const { sqlite3 } = api.runtime;
          await sqlite3.exec(db, 'BEGIN IMMEDIATE');
          try {
            for (const statement of statements) {
              let count = 0;
              for await (const prepared of sqlite3.statements(
                db,
                statement.sql,
              )) {
                count += 1;
                sqlite3.bind_collection(prepared, [...statement.parameters]);
                await sqlite3.step(prepared);
              }
              if (count !== 1) {
                throw new Error(
                  'Committed SQL entry must contain one statement',
                );
              }
            }
            await sqlite3.exec(db, 'COMMIT');
          } catch (cause) {
            await sqlite3.exec(db, 'ROLLBACK');
            throw cause;
          }
        },
        catch: cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : ZerospinError.catch({
                code: 'backup-db-apply-failed',
                message: 'Failed to apply committed SQL to IndexedDB backup',
              })(cause),
      }).pipe(Effect.uninterruptible),
    );
  },
);
