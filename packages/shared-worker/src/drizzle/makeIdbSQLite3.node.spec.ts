import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const moduleFactory = vi.hoisted(() =>
  vi.fn(async (_options?: { locateFile?: () => string }) => ({ module: true })),
);
const vfsRegister = vi.hoisted(() => vi.fn());
const openV2 = vi.hoisted(() => vi.fn(async () => 123));
const exec = vi.hoisted(() => vi.fn(async () => undefined));
const createVfs = vi.hoisted(() =>
  vi.fn(function (
    this: {
      mxPathName: number;
      name: string;
    },
    name: string,
  ) {
    this.name = name;
    this.mxPathName = 64;
  }),
);

vi.mock('wa-sqlite/dist/wa-sqlite-async.mjs', () => ({
  default: moduleFactory,
}));

vi.mock('wa-sqlite', () => ({
  Factory: vi.fn(() => ({
    exec,
    open_v2: openV2,
    vfs_register: vfsRegister,
  })),
  SQLITE_OPEN_CREATE: 4,
  SQLITE_OPEN_READWRITE: 2,
}));

vi.mock('wa-sqlite/src/examples/IDBBatchAtomicVFS.js', () => ({
  IDBBatchAtomicVFS: createVfs,
}));

describe('makeIdbSQLite3', () => {
  beforeEach(() => {
    moduleFactory.mockClear();
    createVfs.mockClear();
    openV2.mockClear();
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => []),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers IDBBatchAtomicVFS and opens the named IndexedDB database asynchronously', async () => {
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    const client = await makeIdbSQLite3({
      databaseName: 'frontend-replica.db',
      mode: 'create-or-open',
      vfsName: 'zerospin/session/test/frontend-replicas/replica.db',
    });

    expect(moduleFactory).toHaveBeenCalledWith();
    expect(createVfs).toHaveBeenCalledWith(
      'zerospin/session/test/frontend-replicas/replica.db',
    );
    expect(client.vfs).toMatchObject({
      name: 'zerospin/session/test/frontend-replicas/replica.db',
      mxPathName: 4096,
      Xc: 4096,
    });
    expect(vfsRegister).toHaveBeenCalledWith(client.vfs, false);
    expect(openV2).toHaveBeenCalledWith(
      'frontend-replica.db',
      6,
      'zerospin/session/test/frontend-replicas/replica.db',
    );
    expect(exec).toHaveBeenCalledWith(123, 'PRAGMA foreign_keys = ON;');
    expect(client.db).toBe(123);
  });

  it('loads wa-sqlite from the explicit worker asset URL', async () => {
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    await makeIdbSQLite3({
      databaseName: 'frontend-replica.db',
      mode: 'create-or-open',
      vfsName: 'zerospin/session/test/frontend-replicas/replica.db',
      wasmUrl: 'https://app.example/_next/static/media/wa-sqlite-async.wasm',
    });

    const moduleOptions = moduleFactory.mock.calls[0]?.[0];
    expect(moduleOptions?.locateFile?.()).toBe(
      'https://app.example/_next/static/media/wa-sqlite-async.wasm',
    );
  });

  it('requires an existing VFS without constructing one in existing-only mode', async () => {
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    await expect(
      makeIdbSQLite3({
        databaseName: 'frontend-replica.db',
        mode: 'existing-only',
        vfsName: 'zerospin/056/sys_1/users/user_1/aggregate/replica_1',
      }),
    ).rejects.toThrow('IndexedDB VFS does not exist');

    expect(createVfs).not.toHaveBeenCalled();
    expect(openV2).not.toHaveBeenCalled();
  });

  it('preflights the exact current VFS layout and omits SQLITE_OPEN_CREATE in existing-only mode', async () => {
    const transaction = {
      error: null,
      objectStore: vi.fn(() => ({
        autoIncrement: false,
        indexNames: ['version'],
        keyPath: ['path', 'offset', 'version'],
        index: vi.fn(() => ({
          keyPath: ['path', 'version'],
          multiEntry: false,
          unique: false,
        })),
      })),
      addEventListener: vi.fn((eventName: string, listener: () => void) => {
        if (eventName === 'complete') queueMicrotask(listener);
      }),
    };
    const database = {
      version: 5,
      objectStoreNames: ['blocks'],
      transaction: vi.fn(() => transaction),
      close: vi.fn(),
    };
    const openRequest = {
      result: database,
      error: null,
      transaction: null,
      addEventListener: vi.fn((eventName: string, listener: () => void) => {
        if (eventName === 'success') queueMicrotask(listener);
      }),
    };
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [
        {
          name: 'zerospin/056/sys_1/users/user_1/aggregate/replica_1',
          version: 5,
        },
      ]),
      open: vi.fn(() => openRequest),
    });
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    await makeIdbSQLite3({
      databaseName: 'frontend-replica.db',
      mode: 'existing-only',
      vfsName: 'zerospin/056/sys_1/users/user_1/aggregate/replica_1',
    });

    expect(database.close).toHaveBeenCalledTimes(1);
    expect(openV2).toHaveBeenCalledWith(
      'frontend-replica.db',
      2,
      'zerospin/056/sys_1/users/user_1/aggregate/replica_1',
    );
  });
});
