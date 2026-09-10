import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

import type { BackupWorkerApi } from '../BackupWorkerApi/BackupWorkerApi.ts';

/** Asyncify must finish every suspended backup operation before SQLite is entered again. */
export const copySqliteDatabase = Effect.fn('copySqliteDatabase')(
  function* (props: {
    destinationDb: number;
    sourceDb: number;
    module: Awaited<BackupWorkerApi['runtime']>['module'];
  }) {
    const { destinationDb, sourceDb, module } = props;
    return yield* Effect.tryPromise({
      try: async () => {
        const init = module.cwrap(
          'sqlite3_backup_init',
          'number',
          ['number', 'number', 'number', 'number'],
          { async: true },
        );
        const step = module.cwrap(
          'sqlite3_backup_step',
          'number',
          ['number', 'number'],
          { async: true },
        );
        const finish = module.cwrap(
          'sqlite3_backup_finish',
          'number',
          ['number'],
          { async: true },
        );
        const schema = module._sqlite3_malloc(5);
        module.HEAPU8.set(new Uint8Array([109, 97, 105, 110, 0]), schema);
        try {
          const backup = await init(destinationDb, schema, sourceDb, schema);
          if (backup === 0) throw new Error('sqlite3_backup_init failed');
          let stepped: number = SQLite.SQLITE_ERROR;
          let finished: number = SQLite.SQLITE_ERROR;
          try {
            stepped = await step(backup, -1);
          } finally {
            finished = await finish(backup);
          }
          if (stepped !== SQLite.SQLITE_DONE) {
            throw new Error(`sqlite3_backup_step failed with code ${stepped}`);
          }
          if (finished !== SQLite.SQLITE_OK) {
            throw new Error(
              `sqlite3_backup_finish failed with code ${finished}`,
            );
          }
        } finally {
          module._sqlite3_free(schema);
        }
      },
      catch: cause => cause,
    });
  },
);
