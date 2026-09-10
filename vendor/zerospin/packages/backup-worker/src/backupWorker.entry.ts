import { newMessagePortRpcSession } from 'capnweb';
import { Effect, Semaphore } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { IDBBatchAtomicVFS } from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

import { BackupWorkerApi } from './BackupWorkerApi/BackupWorkerApi.ts';

declare const self: SharedWorkerGlobalScope;

const lifetime = Promise.withResolvers<void>();
const locked = Promise.withResolvers<void>();
void navigator.locks
  .request('zerospin-backups-lifetime', { mode: 'exclusive' }, async () => {
    locked.resolve();
    await lifetime.promise;
  })
  .catch(locked.reject);

const runtime: BackupWorkerApi['runtime'] = (async () => {
  await locked.promise;
  const namespace = 'zerospin-backups-idb-v1';
  const existing = (await indexedDB.databases()).find(
    database => database.name === namespace,
  );
  if (existing) {
    // The native VFS creates its fixed version-6 layout only in empty storage.
    // Refuse a different layout before it can execute an IndexedDB upgrade.
    if (existing.version !== 6) {
      throw new Error(
        'Incompatible IndexedDB backup layout; reset disposable backup storage',
      );
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(namespace);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        try {
          if (
            db.objectStoreNames.length !== 2 ||
            !db.objectStoreNames.contains('blocks') ||
            !db.objectStoreNames.contains('metadata')
          ) {
            throw new Error(
              'Incompatible IndexedDB backup stores; reset disposable backup storage',
            );
          }
          const tx = db.transaction(['blocks', 'metadata'], 'readonly');
          if (
            JSON.stringify(tx.objectStore('blocks').keyPath) !==
              JSON.stringify(['path', 'offset', 'version']) ||
            tx.objectStore('metadata').keyPath !== 'name'
          ) {
            throw new Error(
              'Incompatible IndexedDB backup keys; reset disposable backup storage',
            );
          }
          resolve();
        } catch (cause) {
          reject(cause);
        } finally {
          db.close();
        }
      };
    });
  }
  const module: Awaited<BackupWorkerApi['runtime']>['module'] =
    await SQLiteESMFactory({
      locateFile: () => new URL('./wa-sqlite-async.wasm', import.meta.url).href,
    });
  const sqlite3 = SQLite.Factory(module);
  const vfs = await IDBBatchAtomicVFS.create(namespace, module, {
    idbName: namespace,
  });
  // The upstream base defaults to 64 bytes, shorter than a complete readable backup key.
  vfs.mxPathname = 4096;
  sqlite3.vfs_register(vfs, false);
  return {
    module,
    sqlite3,
    semaphore: Effect.runSync(Semaphore.make(1)),
    current: new Map(),
    handles: new Map(),
  };
})();
void runtime.catch(() => undefined);

self.addEventListener('connect', event => {
  const port = event.ports[0];
  if (!port) return;
  const api = new BackupWorkerApi(runtime);
  const session = newMessagePortRpcSession(port, api);
  session.onRpcBroken(() => {
    api[Symbol.dispose]();
    port.close();
  });
  port.start();
});
