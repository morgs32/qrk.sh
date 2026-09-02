import { newMessagePortRpcSession } from 'capnweb';
import * as Semaphore from 'effect/Semaphore';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';

import { OpfsBackupLeaderApi } from './OpfsBackupLeader/OpfsBackupLeaderApi.ts';

const workerUrl = new URL(globalThis.location.href);
const wasmUrl = workerUrl.searchParams.get('wasmUrl');
if (wasmUrl === null) {
  throw new Error('OPFS backup leader URL is missing wasmUrl');
}

const initialized = Promise.all([
  // oxlint-disable-next-line no-restricted-imports -- wa-sqlite exposes OPFSCoopSyncVFS only from its examples tree.
  import('wa-sqlite/src/examples/OPFSCoopSyncVFS.js'),
  SQLiteESMFactory({
    locateFile: (path: string) =>
      path.endsWith('.wasm') ? new URL(wasmUrl, workerUrl).href : path,
  }),
]).then(async ([{ OPFSCoopSyncVFS }, module]) => {
  const sqlite3 = SQLite.Factory(module);
  const vfs = await OPFSCoopSyncVFS.create('opfs-coop-sync', module);
  vfs.mxPathname = 1024;
  sqlite3.vfs_register(vfs, true);
  return { module, sqlite3 };
});
const semaphore = Semaphore.makeUnsafe(1);
const shutdownRequested = Promise.withResolvers<void>();
const handles = new Map<
  string,
  Readonly<{
    backupClientId: number;
    db: number;
    releaseLock(): void;
  }>
>();
let acceptedPort = false;

globalThis.addEventListener(
  'message',
  event => {
    if (!(event instanceof MessageEvent)) return;
    if (
      typeof event.data === 'object' &&
      event.data !== null &&
      'type' in event.data &&
      event.data.type === 'ShutdownLeader'
    ) {
      shutdownRequested.resolve();
      return;
    }
    const port = event.data;
    if (!(port instanceof MessagePort) || acceptedPort) return;
    acceptedPort = true;

    void initialized
      .then(({ module, sqlite3 }) => {
        const api = new OpfsBackupLeaderApi({
          semaphore,
          sqlite3,
          module,
          handles,
        });
        newMessagePortRpcSession(port, api);
        port.start();
        port.addEventListener('messageerror', () => api[Symbol.dispose](), {
          once: true,
        });
        port.addEventListener('close', () => api[Symbol.dispose](), {
          once: true,
        });
        void shutdownRequested.promise.then(() => {
          api[Symbol.dispose]();
          port.close();
          globalThis.postMessage({ type: 'LeaderShutdownComplete' });
        });
      })
      .catch(error => {
        port.close();
        throw error;
      });
  },
);
