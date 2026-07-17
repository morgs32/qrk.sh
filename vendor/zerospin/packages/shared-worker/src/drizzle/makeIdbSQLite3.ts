import type { SQLiteModuleFactory } from '@zerospin/core/drizzle/waSqliteModuleFactory';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// oxlint-disable-next-line eslint/no-restricted-imports -- wa-sqlite exposes IDBBatchAtomicVFS from this example module
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

/**
 * Creates an IndexedDB-backed SQLite3 instance and opened db using wa-sqlite's asynchronous IDBBatchAtomicVFS.
 * Caller is responsible for calling sqlite3.close(db) and vfs.close() when done.
 */
export async function makeIdbSQLite3(props: {
  databaseName: string;
  moduleFactory?: SQLiteModuleFactory;
  vfsName: string;
  wasmUrl?: string;
}): Promise<{
  sqlite3: ReturnType<typeof SQLite.Factory>;
  db: Awaited<ReturnType<ReturnType<typeof SQLite.Factory>['open_v2']>>;
  vfs: IDBBatchAtomicVFS;
}> {
  const {
    databaseName,
    moduleFactory = SQLiteESMFactory,
    vfsName,
    wasmUrl,
  } = props;
  const module =
    wasmUrl === undefined
      ? await moduleFactory()
      : await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const sqlite3 = SQLite.Factory(module);
  const vfs = new IDBBatchAtomicVFS(vfsName);
  vfs.mxPathName = 4096;
  Reflect.set(vfs, 'Xc', 4096);
  const sqliteVfs = vfs as never as Parameters<typeof sqlite3.vfs_register>[0];
  sqlite3.vfs_register(sqliteVfs, false);
  const db = await sqlite3.open_v2(
    databaseName,
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    vfs.name,
  );
  return { sqlite3, db, vfs };
}
