import type { SQLiteModuleFactory } from '@zerospin/core/drizzle/waSqliteModuleFactory';
import { ZerospinError } from '@zerospin/error';
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
  mode: 'create-or-open' | 'existing-only';
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
    mode,
    moduleFactory = SQLiteESMFactory,
    vfsName,
    wasmUrl,
  } = props;
  const databaseInfos = await globalThis.indexedDB.databases();
  const existingDatabaseInfo = databaseInfos.find(
    databaseInfo => databaseInfo.name === vfsName,
  );
  if (existingDatabaseInfo === undefined && mode === 'existing-only') {
    throw new Error(`IndexedDB VFS does not exist: ${vfsName}`);
  }
  if (
    existingDatabaseInfo?.version !== undefined &&
    existingDatabaseInfo.version !== 5
  ) {
    throw new ZerospinError({
      code: 'browser-persistence-reset-required',
      message:
        "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
    });
  }
  if (existingDatabaseInfo !== undefined) {
    await new Promise<void>((resolve, reject) => {
      const request = globalThis.indexedDB.open(vfsName);
      let settled = false;
      request.addEventListener('upgradeneeded', () => {
        request.transaction?.abort();
        if (settled) return;
        settled = true;
        reject(
          new ZerospinError({
            code: 'browser-persistence-reset-required',
            message:
              "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
          }),
        );
      });
      request.addEventListener('blocked', () => {
        if (settled) return;
        settled = true;
        reject(new Error(`IndexedDB VFS open was blocked: ${vfsName}`));
      });
      request.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        reject(
          request.error ?? new Error(`IndexedDB VFS open failed: ${vfsName}`),
        );
      });
      request.addEventListener('success', () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        if (
          database.version !== 5 ||
          JSON.stringify(Array.from(database.objectStoreNames)) !==
            JSON.stringify(['blocks'])
        ) {
          settled = true;
          database.close();
          reject(
            new ZerospinError({
              code: 'browser-persistence-reset-required',
              message:
                "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
            }),
          );
          return;
        }

        try {
          const transaction = database.transaction('blocks', 'readonly');
          const blocks = transaction.objectStore('blocks');
          const indexNames = Array.from(blocks.indexNames);
          const versionIndex =
            indexNames.length === 1 && indexNames[0] === 'version'
              ? blocks.index('version')
              : null;
          const isCompatible =
            JSON.stringify(blocks.keyPath) ===
              JSON.stringify(['path', 'offset', 'version']) &&
            blocks.autoIncrement === false &&
            versionIndex !== null &&
            JSON.stringify(versionIndex.keyPath) ===
              JSON.stringify(['path', 'version']) &&
            versionIndex.multiEntry === false &&
            versionIndex.unique === false;
          transaction.addEventListener('complete', () => {
            if (settled) return;
            settled = true;
            database.close();
            if (!isCompatible) {
              reject(
                new ZerospinError({
                  code: 'browser-persistence-reset-required',
                  message:
                    "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
                }),
              );
              return;
            }
            resolve();
          });
          transaction.addEventListener('abort', () => {
            if (settled) return;
            settled = true;
            database.close();
            reject(
              transaction.error ??
                new Error(`IndexedDB VFS inspection aborted: ${vfsName}`),
            );
          });
          transaction.addEventListener('error', () => {
            if (settled) return;
            settled = true;
            database.close();
            reject(
              transaction.error ??
                new Error(`IndexedDB VFS inspection failed: ${vfsName}`),
            );
          });
        } catch (cause) {
          settled = true;
          database.close();
          reject(cause);
        }
      });
    });
  }

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
    (mode === 'create-or-open' ? SQLite.SQLITE_OPEN_CREATE : 0) |
      SQLite.SQLITE_OPEN_READWRITE,
    vfs.name,
  );
  await sqlite3.exec(db, 'PRAGMA foreign_keys = ON;');
  return { sqlite3, db, vfs };
}
