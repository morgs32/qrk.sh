import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';

export const copySqliteDatabase = Effect.fn('copySqliteDatabase')(
  function* (props: {
    destinationDb: number;
    module: {
      readonly HEAPU8: Uint8Array;
      pendingOps: Promise<unknown>[];
      retryOps: Promise<unknown>[];
      _sqlite3_backup_finish(backup: number): number;
      _sqlite3_backup_init(
        destinationDb: number,
        destinationName: number,
        sourceDb: number,
        sourceName: number,
      ): number;
      _sqlite3_backup_step(backup: number, pages: number): number;
      _sqlite3_free(pointer: number): void;
      _sqlite3_malloc(size: number): number;
    };
    sourceDb: number;
  }) {
    yield* Effect.tryPromise({
      try: async () => {
        const schemaName = props.module._sqlite3_malloc(5);
        props.module.HEAPU8.set(
          new Uint8Array([109, 97, 105, 110, 0]),
          schemaName,
        );
        try {
          const backup = props.module._sqlite3_backup_init(
            props.destinationDb,
            schemaName,
            props.sourceDb,
            schemaName,
          );
          if (backup === 0) {
            throw new Error('sqlite3_backup_init failed');
          }

          let stepResult: number = SQLite.SQLITE_ERROR;
          let finishResult: number = SQLite.SQLITE_ERROR;
          try {
            for (let retryCount = 0; retryCount < 2; retryCount += 1) {
              if (props.module.retryOps.length > 0) {
                try {
                  await Promise.all(props.module.retryOps);
                } finally {
                  props.module.retryOps = [];
                }
              }
              stepResult = props.module._sqlite3_backup_step(backup, -1);
              if (
                stepResult === SQLite.SQLITE_DONE ||
                props.module.retryOps.length === 0
              ) {
                break;
              }
            }
          } finally {
            finishResult = props.module._sqlite3_backup_finish(backup);
          }

          if (props.module.pendingOps.length > 0) {
            try {
              await Promise.all(props.module.pendingOps);
            } finally {
              props.module.pendingOps = [];
            }
          }

          if (stepResult !== SQLite.SQLITE_DONE) {
            throw new Error(
              `sqlite3_backup_step failed with code ${stepResult}`,
            );
          }
          if (finishResult !== SQLite.SQLITE_OK) {
            throw new Error(
              `sqlite3_backup_finish failed with code ${finishResult}`,
            );
          }
        } finally {
          props.module._sqlite3_free(schemaName);
        }
      },
      catch: cause => cause,
    });
  },
);
