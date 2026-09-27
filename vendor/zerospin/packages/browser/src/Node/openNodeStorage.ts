import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

/** One SQLite engine, database, and VFS for this worker's persistent identity. */
export async function openNodeStorage(props: {
  namespace: string;
  sqliteWasmUrl: string;
  create: boolean;
}) {
  const { namespace, sqliteWasmUrl, create } = props;
  if (
    !create &&
    !(await indexedDB.databases()).some(db => db.name === namespace)
  ) {
    throw new Error('Node storage is missing');
  }
  let serial: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>) => {
    const result = serial.then(work);
    serial = result.catch(() => undefined);
    return result;
  };
  const module = await SQLiteESMFactory({
    locateFile: () => sqliteWasmUrl,
  });
  const sqlite = SQLite.Factory(module);
  const vfs = await IDBBatchAtomicVFS.create(namespace, module, {
    idbName: namespace,
  });
  vfs.mxPathname = 4096;
  sqlite.vfs_register(vfs, false);
  let handle: number | undefined;
  try {
    const opened = await serialized(() =>
      sqlite.open_v2(
        '/node',
        SQLite.SQLITE_OPEN_READWRITE | (create ? SQLite.SQLITE_OPEN_CREATE : 0),
        namespace,
      ),
    );
    handle = opened;
    await serialized(() => sqlite.exec(opened, 'PRAGMA synchronous=FULL'));
    const db = drizzle((query, parameters, method) =>
      serialized(async () => {
        const rows: unknown[][] = [];
        for await (const statement of sqlite.statements(opened, query)) {
          sqlite.bind_collection(statement, parameters);
          while ((await sqlite.step(statement)) === SQLite.SQLITE_ROW) {
            rows.push(sqlite.row(statement));
          }
        }
        return { rows: method === 'get' ? (rows[0] ?? []) : rows };
      }),
    );
    return {
      db,
      close: () =>
        serialized(async () => {
          await sqlite.close(opened);
          await vfs.close();
        }),
    };
  } catch (error) {
    if (handle !== undefined) await sqlite.close(handle);
    await vfs.close();
    throw error;
  }
}
