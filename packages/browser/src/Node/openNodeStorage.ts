import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

/** One async SQLite engine and VFS per host. Each database has its own serialized Node owner. */
export async function openNodeStorage() {
  let serial: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>) => {
    const result = serial.then(work);
    serial = result.catch(() => undefined);
    return result;
  };
  const namespace = 'zerospin-nodes';
  const module = await SQLiteESMFactory({
    locateFile: () => new URL('./node-sqlite.wasm', import.meta.url).href,
  });
  const sqlite = SQLite.Factory(module);
  const vfs = await IDBBatchAtomicVFS.create(namespace, module, {
    idbName: namespace,
  });
  vfs.mxPathname = 4096;
  sqlite.vfs_register(vfs, false);
  return async (key: string) => {
    const handle = await serialized(() =>
      sqlite.open_v2(
        `/nodes/${key}`,
        SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_CREATE,
        namespace,
      ),
    );
    await serialized(() => sqlite.exec(handle, 'PRAGMA synchronous=FULL'));
    return drizzle((query, parameters, method) =>
      serialized(async () => {
        const rows: unknown[][] = [];
        for await (const statement of sqlite.statements(handle, query)) {
          sqlite.bind_collection(statement, parameters);
          while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
            rows.push(sqlite.row(statement));
          }
        }
        return { rows: method === 'get' ? (rows[0] ?? []) : rows };
      }),
    );
  };
}
