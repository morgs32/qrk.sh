import * as SQLite from '@livestore/wa-sqlite';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';

import type { SQLiteModuleFactory } from './waSqliteModuleFactory.ts';

/**
 * Creates an in-memory SQLite3 instance and opened db using the given ESM module factory (default: browser-compatible).
 * Caller is responsible for calling sqlite3.close(db) when done.
 */
export async function makeInMemorySQLite3(
  moduleFactory: SQLiteModuleFactory = SQLiteESMFactory,
): Promise<{
  sqlite3: ReturnType<typeof SQLite.Factory>;
  db: ReturnType<ReturnType<typeof SQLite.Factory>['open_v2Sync']>;
  subscribeToTableChanges(
    listener: (changedTableNames: ReadonlySet<string>) => void,
  ): () => void;
  flushTableChanges(): void;
}> {
  const module = await moduleFactory();
  const sqlite3 = SQLite.Factory(module);
  const db = sqlite3.open_v2Sync(':memory:');
  const pendingTableNames = new Set<string>();
  const tableChangeListeners = new Set<
    (changedTableNames: ReadonlySet<string>) => void
  >();
  let didCommit = false;

  // 1 — SQLite invokes this callback from inside sqlite3_step. Record only the
  // table name here; preparing or stepping a live query in this callback would
  // reenter the same connection before the write statement has finished.
  sqlite3.update_hook(
    db,
    (_updateType, _databaseName, tableName, _rowId) => {
      if (tableName !== null) {
        pendingTableNames.add(tableName);
      }
    },
  );

  // 2 — The commit hook has the same reentrancy restriction. Its only job is
  // to distinguish committed work from table names recorded before rollback.
  sqlite3.commit_hook(db, () => {
    didCommit = true;
    return 0;
  });

  return {
    sqlite3,
    db,
    subscribeToTableChanges(listener) {
      tableChangeListeners.add(listener);

      return () => {
        tableChangeListeners.delete(listener);
      };
    },
    flushTableChanges() {
      // 3 — BEGIN and savepoints keep autocommit disabled. Retain the complete
      // transaction's table set until COMMIT or ROLLBACK finishes stepping.
      if (sqlite3.get_autocommit(db) === 0) {
        return;
      }

      const shouldNotifyListeners = didCommit;
      didCommit = false;

      if (!shouldNotifyListeners) {
        // 4 — No commit hook means the transaction rolled back. Live queries
        // were never notified about its intermediate rows, so no rerun is due.
        pendingTableNames.clear();
        return;
      }

      if (pendingTableNames.size === 0) {
        return;
      }

      // 5 — Clear connection state before invoking listeners. Their synchronous
      // SELECTs use this same client and must observe an already-drained flush.
      const committedTableNames = new Set(pendingTableNames);
      pendingTableNames.clear();

      for (const listener of tableChangeListeners) {
        listener(committedTableNames);
      }
    },
  };
}
