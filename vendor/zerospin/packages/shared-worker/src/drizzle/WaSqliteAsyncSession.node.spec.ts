import { readFile } from 'node:fs/promises';

import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { expect, it } from 'vitest';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// oxlint-disable-next-line eslint/no-restricted-imports -- this test exercises the real Asyncify SQLite boundary.
import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';

import { makeAsyncWaSqliteDrizzle } from './makeAsyncWaSqliteDrizzle.ts';
import { migrateDbAsync } from './migrateDbAsync.ts';

it('migrates an existing async replica schema idempotently without replacing its rows', async () => {
  const module = await SQLiteESMFactory({
    wasmBinary: await readFile(
      new URL(
        '../../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm',
        import.meta.url,
      ),
    ),
  });
  const sqlite3 = SQLite.Factory(module);
  const memoryVfs = new MemoryAsyncVFS();
  const vfs = Object.assign(memoryVfs, {
    close: Reflect.get(memoryVfs, 'close'),
  });
  sqlite3.vfs_register(vfs, false);
  const sqliteDb = await sqlite3.open_v2(
    'idempotent-migration.db',
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    vfs.name,
  );
  const client = { sqlite3, db: sqliteDb, vfs };
  const migrationEvents = makeTable({
    name: 'migrationEvents',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'mevt' }),
      label: primitives.text(),
    },
  });
  const dbConfig = makeDbConfig({ tables: { migrationEvents } });
  const db = makeAsyncWaSqliteDrizzle(client, dbConfig);

  try {
    await Effect.runPromise(migrateDbAsync({ db, schema: dbConfig.schema }));
    await db.run(
      sql`INSERT INTO migrationEvents (id, label) VALUES ('mevt_retained', 'retained')`,
    );

    await Effect.runPromise(migrateDbAsync({ db, schema: dbConfig.schema }));

    await expect(
      db.all<{ id: string; label: string }>(
        sql`SELECT id, label FROM migrationEvents`,
      ),
    ).resolves.toEqual([{ id: 'mevt_retained', label: 'retained' }]);
  } finally {
    await client.sqlite3.close(client.db);
    await client.vfs.close();
  }
});

it('serializes async SQLite statements and keeps each transaction contiguous', async () => {
  const module = await SQLiteESMFactory({
    wasmBinary: await readFile(
      new URL(
        '../../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm',
        import.meta.url,
      ),
    ),
  });
  const sqlite3 = SQLite.Factory(module);
  const memoryVfs = new MemoryAsyncVFS();
  const vfs = Object.assign(memoryVfs, {
    close: Reflect.get(memoryVfs, 'close'),
  });
  sqlite3.vfs_register(vfs, false);
  const sqliteDb = await sqlite3.open_v2(
    'serialized-session.db',
    SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
    vfs.name,
  );
  const client = { sqlite3, db: sqliteDb, vfs };
  const db = makeAsyncWaSqliteDrizzle(client, makeDbConfig({ tables: {} }));
  const originalStep = client.sqlite3.step.bind(client.sqlite3);
  let activeStepCount = 0;
  let maximumActiveStepCount = 0;

  client.sqlite3.step = async statement => {
    activeStepCount += 1;
    maximumActiveStepCount = Math.max(maximumActiveStepCount, activeStepCount);
    await Promise.resolve();
    try {
      return await originalStep(statement);
    } finally {
      activeStepCount -= 1;
    }
  };

  try {
    await db.run(sql`
      CREATE TABLE events (
        sequence integer PRIMARY KEY,
        label text NOT NULL
      )
    `);

    await Promise.all([
      db.run(sql`INSERT INTO events (sequence, label) VALUES (1, 'first')`),
      db.run(sql`INSERT INTO events (sequence, label) VALUES (2, 'second')`),
      db.all<{ count: number }>(sql`SELECT count(*) AS count FROM events`),
      db.all<{ count: number }>(sql`SELECT count(*) AS count FROM events`),
    ]);

    expect(maximumActiveStepCount).toBe(1);
    await expect(
      db.run(sql`SELECT * FROM a_table_that_does_not_exist`),
    ).rejects.toBeDefined();
    await expect(
      db.all<{ count: number }>(sql`SELECT count(*) AS count FROM events`),
    ).resolves.toEqual([{ count: 2 }]);

    const transactionReachedBarrier = Promise.withResolvers<void>();
    const releaseTransaction = Promise.withResolvers<void>();
    const transaction = db.transaction(async tx => {
      await tx.run(
        sql`INSERT INTO events (sequence, label) VALUES (3, 'transaction-before-barrier')`,
      );
      transactionReachedBarrier.resolve();
      await releaseTransaction.promise;
      await tx.transaction(async nestedTx => {
        await nestedTx.run(
          sql`INSERT INTO events (sequence, label) VALUES (4, 'nested-transaction')`,
        );
      });
      await tx.run(
        sql`INSERT INTO events (sequence, label) VALUES (5, 'transaction-after-barrier')`,
      );
    });

    await transactionReachedBarrier.promise;
    let concurrentReadSettled = false;
    const concurrentRead = db
      .all<{ sequence: number }>(
        sql`SELECT sequence FROM events ORDER BY sequence`,
      )
      .then(rows => {
        concurrentReadSettled = true;
        return rows;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(concurrentReadSettled).toBe(false);

    releaseTransaction.resolve();
    await transaction;
    await expect(concurrentRead).resolves.toEqual([
      { sequence: 1 },
      { sequence: 2 },
      { sequence: 3 },
      { sequence: 4 },
      { sequence: 5 },
    ]);
    expect(maximumActiveStepCount).toBe(1);

    const rollbackReachedBarrier = Promise.withResolvers<void>();
    const releaseRollback = Promise.withResolvers<void>();
    const rolledBackTransaction = db.transaction(async tx => {
      await tx.run(
        sql`INSERT INTO events (sequence, label) VALUES (6, 'must-roll-back')`,
      );
      rollbackReachedBarrier.resolve();
      await releaseRollback.promise;
      throw new Error('intentional transaction rollback');
    });
    const rejectedRollback = expect(rolledBackTransaction).rejects.toThrow(
      'intentional transaction rollback',
    );

    await rollbackReachedBarrier.promise;
    let readQueuedBehindRollbackSettled = false;
    const readQueuedBehindRollback = db
      .all<{ sequence: number }>(
        sql`SELECT sequence FROM events ORDER BY sequence`,
      )
      .then(rows => {
        readQueuedBehindRollbackSettled = true;
        return rows;
      });
    await Promise.resolve();
    await Promise.resolve();
    expect(readQueuedBehindRollbackSettled).toBe(false);
    releaseRollback.resolve();
    await rejectedRollback;
    await expect(readQueuedBehindRollback).resolves.toEqual([
      { sequence: 1 },
      { sequence: 2 },
      { sequence: 3 },
      { sequence: 4 },
      { sequence: 5 },
    ]);

    await db.transaction(async tx => {
      await tx.run(
        sql`INSERT INTO events (sequence, label) VALUES (6, 'outer-before-nested-rollback')`,
      );
      await expect(
        tx.transaction(async nestedTx => {
          await nestedTx.run(
            sql`INSERT INTO events (sequence, label) VALUES (7, 'nested-must-roll-back')`,
          );
          throw new Error('intentional nested rollback');
        }),
      ).rejects.toThrow('intentional nested rollback');
      await tx.run(
        sql`INSERT INTO events (sequence, label) VALUES (8, 'outer-after-nested-rollback')`,
      );
    });

    await Promise.all([
      db.transaction(async tx => {
        await tx.run(
          sql`INSERT INTO events (sequence, label) VALUES (9, 'first-concurrent-transaction')`,
        );
      }),
      db.transaction(async tx => {
        await tx.run(
          sql`INSERT INTO events (sequence, label) VALUES (10, 'second-concurrent-transaction')`,
        );
      }),
    ]);
    await expect(
      db.all<{ sequence: number }>(
        sql`SELECT sequence FROM events ORDER BY sequence`,
      ),
    ).resolves.toEqual([
      { sequence: 1 },
      { sequence: 2 },
      { sequence: 3 },
      { sequence: 4 },
      { sequence: 5 },
      { sequence: 6 },
      { sequence: 8 },
      { sequence: 9 },
      { sequence: 10 },
    ]);
    expect(maximumActiveStepCount).toBe(1);
  } finally {
    client.sqlite3.step = originalStep;
    await client.sqlite3.close(client.db);
    await client.vfs.close();
  }
});
