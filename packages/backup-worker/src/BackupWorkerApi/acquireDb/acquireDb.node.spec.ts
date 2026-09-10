import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { newMessagePortRpcSession, RpcStub } from 'capnweb';
import { Effect, Exit, Fiber, Scope, Semaphore } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';

import { acquireBackupWorker } from '../../acquireBackupWorker/acquireBackupWorker.ts';
import { BackupWorkerApi } from '../BackupWorkerApi.ts';

const require = createRequire(import.meta.url);
let runtime: Awaited<BackupWorkerApi['runtime']>;
const roots: BackupWorkerApi[] = [];
const ports: MessagePort[] = [];

beforeEach(async () => {
  const module: Awaited<BackupWorkerApi['runtime']>['module'] =
    await SQLiteESMFactory({
      wasmBinary: await readFile(
        require.resolve('wa-sqlite/dist/wa-sqlite-async.wasm'),
      ),
    });
  const sqlite3 = SQLite.Factory(module);
  const open = sqlite3.open_v2;
  // These tests isolate capability semantics over real RPC and SQLite. IndexedDB is covered in Chromium.
  vi.spyOn(sqlite3, 'open_v2').mockImplementation(() => open(':memory:'));
  runtime = {
    module,
    sqlite3,
    semaphore: Effect.runSync(Semaphore.make(1)),
    current: new Map(),
    handles: new Map(),
  };
});

afterEach(async () => {
  for (const root of roots.splice(0)) root[Symbol.dispose]();
  await Effect.runPromise(runtime.semaphore.withPermits(1)(Effect.void));
  for (const port of ports.splice(0)) port.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('revocable database capabilities', () => {
  it('retains callbacks past acquisition and preserves a current owner through duplicate stub disposal', async () => {
    const root = new BackupWorkerApi(Promise.resolve(runtime));
    roots.push(root);
    const channel = new MessageChannel();
    ports.push(channel.port1, channel.port2);
    newMessagePortRpcSession(channel.port1, root);
    using client = newMessagePortRpcSession<BackupWorkerApi>(channel.port2);
    const revoked = Promise.withResolvers<void>();
    using callback = new RpcStub(() => revoked.resolve());
    using acquired = await client.acquireDb({
      backupKey: '/zerospin/test/backup.sqlite3',
      onRevoked: callback,
    });
    expect(acquired._tag).toBe('Success');
    if (acquired._tag !== 'Success') throw new Error('Acquisition failed');
    const original = acquired.success.db;
    using duplicate = original.dup();
    using current = await client.acquireDb({
      backupKey: '/zerospin/test/backup.sqlite3',
      onRevoked: callback,
    });
    expect(current._tag === 'Success' && current.success.status).toBe(
      'current',
    );
    current[Symbol.dispose]();
    expect(
      await original.applyStatements({
        statements: [{ sql: 'CREATE TABLE test(value TEXT)', parameters: [] }],
      }),
    ).toMatchObject({ _tag: 'Success' });

    const successorRoot = new BackupWorkerApi(Promise.resolve(runtime));
    roots.push(successorRoot);
    using successorClient = new RpcStub(successorRoot);
    using successor = await successorClient.acquireDb({
      backupKey: '/zerospin/test/backup.sqlite3',
      onRevoked: callback,
    });
    await revoked.promise;
    expect(successor._tag === 'Success' && successor.success.status).toBe(
      'acquired',
    );
    expect(await duplicate.applyStatements({ statements: [] })).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-revoked' },
    });
    expect(await duplicate.dispose()).toMatchObject({ _tag: 'Success' });
    if (successor._tag !== 'Success') throw new Error('Successor failed');
    expect(
      await successor.success.db.applyStatements({
        statements: [
          { sql: "INSERT INTO test VALUES ('successor')", parameters: [] },
        ],
      }),
    ).toMatchObject({ _tag: 'Success' });
  });

  it('finishes an in-flight transaction and rejects queued stale calls before restoring the successor', async () => {
    const root = new BackupWorkerApi(Promise.resolve(runtime));
    const nextRoot = new BackupWorkerApi(Promise.resolve(runtime));
    roots.push(root, nextRoot);
    using client = new RpcStub(root);
    using next = new RpcStub(nextRoot);
    const revoked = Promise.withResolvers<void>();
    using callback = new RpcStub(() => revoked.resolve());
    using acquired = await client.acquireDb({
      backupKey: '/zerospin/transaction/backup.sqlite3',
      onRevoked: callback,
    });
    if (acquired._tag !== 'Success') throw new Error('Acquisition failed');
    const db = acquired.success.db;
    await db.applyStatements({
      statements: [{ sql: 'CREATE TABLE test(value TEXT)', parameters: [] }],
    });
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const exec = runtime.sqlite3.exec;
    let intercept = true;
    vi.spyOn(runtime.sqlite3, 'exec').mockImplementation(
      async (handle, sql, callback) => {
        if (sql === 'BEGIN IMMEDIATE' && intercept) {
          intercept = false;
          entered.resolve();
          await release.promise;
        }
        return exec(handle, sql, callback);
      },
    );
    const inFlight = Promise.resolve(
      db.applyStatements({
        statements: [
          { sql: "INSERT INTO test VALUES ('committed')", parameters: [] },
        ],
      }),
    );
    await entered.promise;
    const stale = Promise.resolve(
      db.applyStatements({
        statements: [
          { sql: "INSERT INTO test VALUES ('stale')", parameters: [] },
        ],
      }),
    );
    const successorPromise = Promise.resolve(
      next.acquireDb({
        backupKey: '/zerospin/transaction/backup.sqlite3',
        onRevoked: callback,
      }),
    );
    await revoked.promise;
    release.resolve();
    expect(await inFlight).toMatchObject({ _tag: 'Success' });
    expect(await stale).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-revoked' },
    });
    using successor = await successorPromise;
    expect(successor._tag === 'Success' && successor.success.status).toBe(
      'acquired',
    );
    const values: unknown[] = [];
    const handle = runtime.handles.get('/zerospin/transaction/backup.sqlite3');
    if (handle === undefined) throw new Error('Missing current database');
    await runtime.sqlite3.exec(handle, 'SELECT value FROM test', row => {
      values.push(row[0]);
    });
    expect(values).toEqual(['committed']);
  });

  it('rolls back failed statement batches and round trips real async snapshots', async () => {
    const root = new BackupWorkerApi(Promise.resolve(runtime));
    roots.push(root);
    using client = new RpcStub(root);
    using callback = new RpcStub(() => undefined);
    using acquired = await client.acquireDb({
      backupKey: '/zerospin/atomic/backup.sqlite3',
      onRevoked: callback,
    });
    if (acquired._tag !== 'Success') throw new Error('Acquisition failed');
    const db = acquired.success.db;
    await db.applyStatements({
      statements: [{ sql: 'CREATE TABLE test(value TEXT)', parameters: [] }],
    });
    expect(
      await db.applyStatements({
        statements: [
          { sql: "INSERT INTO test VALUES ('rolled back')", parameters: [] },
          { sql: 'INSERT INTO missing VALUES (1)', parameters: [] },
        ],
      }),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-apply-failed' },
    });
    await db.applyStatements({
      statements: [
        { sql: "INSERT INTO test VALUES ('persisted')", parameters: [] },
      ],
    });
    const snapshot = await db.exportSnapshot();
    if (snapshot._tag !== 'Success' || snapshot.success === null) {
      throw new Error('Snapshot failed');
    }
    await db.applyStatements({
      statements: [{ sql: 'DELETE FROM test', parameters: [] }],
    });
    expect(await db.overwriteDb({ snapshot: snapshot.success })).toMatchObject({
      _tag: 'Success',
    });
    const values: unknown[] = [];
    const handle = runtime.handles.get('/zerospin/atomic/backup.sqlite3');
    if (handle === undefined) throw new Error('Missing database');
    await runtime.sqlite3.exec(handle, 'SELECT value FROM test', row => {
      values.push(row[0]);
    });
    expect(values).toEqual(['persisted']);
    expect(
      await db.overwriteDb({ snapshot: new Uint8Array(200) }),
    ).toMatchObject({ _tag: 'Failure' });
    expect(await db.exportSnapshot()).toMatchObject({ _tag: 'Success' });
  });
});

describe('scoped page connections', () => {
  it('expires a dispatched reply on worker loss, opens the next generation, and never replays SQL', async () => {
    const workers: EventTarget[] = [];
    const observations: AbortSignal[] = [];
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, options: { signal: AbortSignal }) => {
          observations.push(options.signal);
          return new Promise<void>((_resolve, reject) =>
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('closed', 'AbortError')),
              { once: true },
            ),
          );
        },
      },
    });
    vi.stubGlobal(
      'SharedWorker',
      class extends EventTarget {
        readonly port: MessagePort;
        constructor(url: string, options: SharedWorkerOptions) {
          super();
          expect(url).toBe('/__zerospin/backup-worker.js');
          expect(options).toEqual({ name: 'zerospin-backups', type: 'module' });
          const channel = new MessageChannel();
          this.port = channel.port1;
          ports.push(channel.port1, channel.port2);
          const root = new BackupWorkerApi(Promise.resolve(runtime));
          roots.push(root);
          newMessagePortRpcSession(channel.port2, root);
          workers.push(this);
        }
      },
    );
    const scope = Scope.makeUnsafe();
    try {
      const page = await Effect.runPromise(
        acquireBackupWorker().pipe(Scope.provide(scope)),
      );
      const db = (
        await Effect.runPromise(
          page.acquireDb({
            backupKey: '/zerospin/loss/backup.sqlite3',
            onRevoked: () => undefined,
          }),
        )
      ).db;
      await Effect.runPromise(
        db.applyStatements({
          statements: [
            { sql: 'CREATE TABLE test(value TEXT)', parameters: [] },
          ],
        }),
      );
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const exec = runtime.sqlite3.exec;
      let starts = 0;
      vi.spyOn(runtime.sqlite3, 'exec').mockImplementation(
        async (handle, sql, callback) => {
          if (sql === 'BEGIN IMMEDIATE') {
            starts += 1;
            entered.resolve();
            await release.promise;
          }
          return exec(handle, sql, callback);
        },
      );
      const pending = Effect.runPromise(
        db
          .applyStatements({
            statements: [
              { sql: "INSERT INTO test VALUES ('once')", parameters: [] },
            ],
          })
          .pipe(
            Effect.match({
              onFailure: error => error.code,
              onSuccess: () => 'success',
            }),
          ),
      );
      await entered.promise;
      let disconnected = 0;
      page.onDisconnect(() => {
        disconnected += 1;
      });
      workers[0]?.dispatchEvent(new Event('error'));
      expect(await pending).toBe('backup-request-uncertain');
      expect(disconnected).toBe(1);
      expect(workers).toHaveLength(2);
      expect(
        await Effect.runPromise(
          db.applyStatements({ statements: [] }).pipe(
            Effect.match({
              onFailure: error => error.code,
              onSuccess: () => 'success',
            }),
          ),
        ),
      ).toBe('backup-request-uncertain');
      release.resolve();
      const successor = await Effect.runPromise(
        page.acquireDb({
          backupKey: '/zerospin/loss/backup.sqlite3',
          onRevoked: () => undefined,
        }),
      );
      expect(successor.status).toBe('acquired');
      expect(starts).toBe(1);
      const target = runtime.current.get('/zerospin/loss/backup.sqlite3');
      const handle = runtime.handles.get('/zerospin/loss/backup.sqlite3');
      if (!target || handle === undefined) throw new Error('Missing successor');
      const disposedTarget = vi.spyOn(target, Symbol.dispose);
      const close = runtime.sqlite3.close;
      vi.spyOn(runtime.sqlite3, 'close').mockRejectedValueOnce(
        new Error('Simulated close failure'),
      );
      expect(
        await Effect.runPromise(
          successor.db.dispose().pipe(
            Effect.match({
              onFailure: error => error.code,
              onSuccess: () => 'success',
            }),
          ),
        ),
      ).toBe('backup-db-close-failed');
      await vi.waitFor(() => expect(disposedTarget).toHaveBeenCalled());
      await close(handle);
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every(signal => signal.aborted)).toBe(true);
  });

  it('cleans a canceled acquisition without disposing a newer owner of its key', async () => {
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, options: { signal: AbortSignal }) =>
          new Promise<void>((_resolve, reject) =>
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('closed', 'AbortError')),
              { once: true },
            ),
          ),
      },
    });
    vi.stubGlobal(
      'SharedWorker',
      class extends EventTarget {
        readonly port: MessagePort;
        constructor() {
          super();
          const channel = new MessageChannel();
          this.port = channel.port1;
          ports.push(channel.port1, channel.port2);
          const root = new BackupWorkerApi(Promise.resolve(runtime));
          roots.push(root);
          newMessagePortRpcSession(channel.port2, root);
        }
      },
    );
    const firstScope = Scope.makeUnsafe();
    const nextScope = Scope.makeUnsafe();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = Effect.runPromise(
      runtime.semaphore.withPermits(1)(
        Effect.promise(async () => {
          entered.resolve();
          await release.promise;
        }),
      ),
    );
    try {
      const first = await Effect.runPromise(
        acquireBackupWorker().pipe(Scope.provide(firstScope)),
      );
      const next = await Effect.runPromise(
        acquireBackupWorker().pipe(Scope.provide(nextScope)),
      );
      await entered.promise;
      const pending = Effect.runFork(
        first.acquireDb({
          backupKey: '/zerospin/cancel/backup.sqlite3',
          onRevoked: () => undefined,
        }),
      );
      await vi.waitFor(() => expect(roots[0]?.targets.size).toBe(1));
      await Effect.runPromise(Fiber.interrupt(pending));
      const successorPromise = Effect.runPromise(
        next.acquireDb({
          backupKey: '/zerospin/cancel/backup.sqlite3',
          onRevoked: () => undefined,
        }),
      );
      await vi.waitFor(() => expect(roots[1]?.targets.size).toBe(1));
      release.resolve();
      const successor = await successorPromise;
      expect(successor.status).toBe('acquired');
      await held;
      expect(
        await Effect.runPromise(
          successor.db
            .applyStatements({
              statements: [
                {
                  sql: 'CREATE TABLE still_current(value TEXT)',
                  parameters: [],
                },
              ],
            })
            .pipe(
              Effect.match({
                onFailure: error => error.code,
                onSuccess: () => 'success',
              }),
            ),
        ),
      ).toBe('success');
      expect(roots[0]?.targets.size).toBe(0);
      expect(roots[1]?.targets.size).toBe(1);
      const loneEntered = Promise.withResolvers<void>();
      const loneRelease = Promise.withResolvers<void>();
      const loneHeld = Effect.runPromise(
        runtime.semaphore.withPermits(1)(
          Effect.promise(async () => {
            loneEntered.resolve();
            await loneRelease.promise;
          }),
        ),
      );
      await loneEntered.promise;
      const canceled = Effect.runFork(
        first.acquireDb({
          backupKey: '/zerospin/cancel-alone/backup.sqlite3',
          onRevoked: () => undefined,
        }),
      );
      await vi.waitFor(() => expect(roots[0]?.targets.size).toBe(1));
      await Effect.runPromise(Fiber.interrupt(canceled));
      loneRelease.resolve();
      await loneHeld;
      await vi.waitFor(() => expect(roots[0]?.targets.size).toBe(0));
      expect(roots[1]?.targets.size).toBe(1);
    } finally {
      release.resolve();
      await Effect.runPromise(Scope.close(firstScope, Exit.void));
      await Effect.runPromise(Scope.close(nextScope, Exit.void));
    }
  });
});
