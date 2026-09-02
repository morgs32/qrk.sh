import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { ISessionId } from '@zerospin/core/session/types';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeaderApi.ts';

export const applyTransaction = Effect.fn(
  'OpfsBackupLeaderApi.applyTransaction',
)(function* (props: {
  api: OpfsBackupLeaderApi;
  backupClientId: number;
  backupKey: string;
  sessionId: ISessionId;
  statements: readonly ICommittedSqlStatement[];
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
          throw new Error(
            'Calling backup client does not claim this session backup',
          );
        }

        await props.api.sqlite3.exec(handle.db, 'BEGIN IMMEDIATE');
        try {
          for (const statement of props.statements) {
            let preparedCount = 0;
            for await (const prepared of props.api.sqlite3.statements(
              handle.db,
              statement.sql,
            )) {
              preparedCount += 1;
              props.api.sqlite3.bind_collection(prepared, [
                ...statement.parameters,
              ]);
              await props.api.sqlite3.step(prepared);
            }
            if (preparedCount !== 1) {
              throw new Error('Committed SQL entry must contain one statement');
            }
          }
          await props.api.sqlite3.exec(handle.db, 'COMMIT');
        } catch (cause) {
          await props.api.sqlite3.exec(handle.db, 'ROLLBACK');
          throw cause;
        }
      },
      catch: ZerospinError.catch({
        code: 'opfs-backup-apply-failed',
        message: 'Failed to apply committed SQL to OPFS backup',
      }),
    }),
  );
});
