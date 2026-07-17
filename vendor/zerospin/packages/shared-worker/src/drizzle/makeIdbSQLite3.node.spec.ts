import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleFactory = vi.hoisted(() =>
  vi.fn(async (_options?: { locateFile?: () => string }) => ({ module: true })),
);
const vfsRegister = vi.hoisted(() => vi.fn());
const openV2 = vi.hoisted(() => vi.fn(async () => 123));
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
  });

  it('registers IDBBatchAtomicVFS and opens the named IndexedDB database asynchronously', async () => {
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    const client = await makeIdbSQLite3({
      databaseName: 'frontend-replica.db',
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
    expect(client.db).toBe(123);
  });

  it('loads wa-sqlite from the explicit worker asset URL', async () => {
    const { makeIdbSQLite3 } = await import('./makeIdbSQLite3');

    await makeIdbSQLite3({
      databaseName: 'frontend-replica.db',
      vfsName: 'zerospin/session/test/frontend-replicas/replica.db',
      wasmUrl: 'https://app.example/_next/static/media/wa-sqlite-async.wasm',
    });

    const moduleOptions = moduleFactory.mock.calls[0]?.[0];
    expect(moduleOptions?.locateFile?.()).toBe(
      'https://app.example/_next/static/media/wa-sqlite-async.wasm',
    );
  });
});
