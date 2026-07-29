import { readFile } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// oxlint-disable-next-line eslint/no-restricted-imports -- these tests require wa-sqlite's real in-memory Asyncify VFS.
import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';
import { describe, expect, it } from 'vitest';

import { makeAsyncWaSqliteDrizzle } from '../drizzle/makeAsyncWaSqliteDrizzle.ts';

import { partitionMigrations } from './drizzle/partition/migrations.ts';
import { migratePartitionDbAsync } from './migratePartitionDbAsync.ts';
import {
  accountFrontendCommandJournal,
  accountFrontendReplicas,
  partitionDbConfig,
  replicas,
  serviceFrontendReplicas,
} from './partitionSchemas.ts';

describe('migratePartitionDbAsync', () => {
  it('upgrades a legacy partition through the real async wa-sqlite path without changing its legacy replica', async () => {
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
      'legacy-partition.db',
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name,
    );
    await sqlite3.exec(sqliteDb, 'PRAGMA foreign_keys = ON;');
    const client = { sqlite3, db: sqliteDb, vfs };
    const db = makeAsyncWaSqliteDrizzle(client, partitionDbConfig);

    try {
      await db.run(sql`
        CREATE TABLE __drizzle_migrations (
          id INTEGER PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric,
          name text,
          applied_at TEXT
        );
      `);
      const legacyMigration = partitionMigrations[0];
      if (legacyMigration === undefined) {
        throw new Error('Expected the legacy replica migration');
      }
      const legacyReplicaStatement = legacyMigration.sql[0];
      if (legacyReplicaStatement === undefined) {
        throw new Error('Expected the legacy replica table statement');
      }
      await db.run(sql.raw(legacyReplicaStatement));
      await db.run(sql`
        INSERT INTO __drizzle_migrations
          (hash, created_at, name, applied_at)
        VALUES
          (${legacyMigration.hash}, ${legacyMigration.createdAt}, ${legacyMigration.name}, ${'2026-07-27T22:36:51.000Z'});
      `);
      await db
        .insert(replicas)
        .values({
          id: 'frp_legacy_async',
          accountId: 'acct_legacy_async',
          accountName: 'user',
          actorId: 'actr_legacy_async',
          actorName: 'shopper',
          frontendName: 'web',
          frontendVersion: '1.0.0',
          databaseName: 'legacy-async-replica.db',
        })
        .run();

      await Effect.runPromise(migratePartitionDbAsync({ db }));

      const legacyRows = await db.select().from(replicas).all();
      const accountRows = await db.select().from(accountFrontendReplicas).all();
      const serviceRows = await db.select().from(serviceFrontendReplicas).all();
      const journalRows = await db
        .select()
        .from(accountFrontendCommandJournal)
        .all();
      const migrationRows = await db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(legacyRows).toEqual([
        {
          id: 'frp_legacy_async',
          accountId: 'acct_legacy_async',
          accountName: 'user',
          actorId: 'actr_legacy_async',
          actorName: 'shopper',
          frontendName: 'web',
          frontendVersion: '1.0.0',
          databaseName: 'legacy-async-replica.db',
        },
      ]);
      expect(accountRows).toEqual([]);
      expect(serviceRows).toEqual([]);
      expect(journalRows).toEqual([]);
      expect(migrationRows).toHaveLength(2);
      expect(migrationRows[0]?.name).toMatch(/^20260707224326_/);
      expect(migrationRows[1]?.name).toMatch(/^20260727223651_/);
    } finally {
      await client.sqlite3.close(client.db);
      await client.vfs.close();
    }
  });

  it('rolls back an interrupted async migration, re-enters after the obstruction is removed, and stays idempotent', async () => {
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
      'interrupted-partition.db',
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name,
    );
    await sqlite3.exec(sqliteDb, 'PRAGMA foreign_keys = ON;');
    const client = { sqlite3, db: sqliteDb, vfs };
    const db = makeAsyncWaSqliteDrizzle(client, partitionDbConfig);

    try {
      await db.run(sql`
        CREATE TABLE __drizzle_migrations (
          id INTEGER PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric,
          name text,
          applied_at TEXT
        );
      `);
      const legacyMigration = partitionMigrations[0];
      if (legacyMigration === undefined) {
        throw new Error('Expected the legacy replica migration');
      }
      const legacyReplicaStatement = legacyMigration.sql[0];
      if (legacyReplicaStatement === undefined) {
        throw new Error('Expected the legacy replica table statement');
      }
      await db.run(sql.raw(legacyReplicaStatement));
      await db.run(sql`
        INSERT INTO __drizzle_migrations
          (hash, created_at, name, applied_at)
        VALUES
          (${legacyMigration.hash}, ${legacyMigration.createdAt}, ${legacyMigration.name}, ${'2026-07-27T22:36:51.000Z'});
      `);

      // The second migration creates the service catalog after its account
      // tables. This incompatible pre-existing table forces that real async
      // transaction to fail after it has already executed earlier statements.
      await db.run(sql`
        CREATE TABLE serviceFrontendReplicas (
          id text PRIMARY KEY
        );
      `);

      await expect(
        Effect.runPromise(migratePartitionDbAsync({ db })),
      ).rejects.toBeDefined();

      const interruptedMigrationRows = await db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );
      const interruptedTableRows = await db.all<{ name: string }>(sql`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'accountFrontendCommandJournal',
            'accountFrontendReplicas',
            'serviceFrontendReplicas'
          )
        ORDER BY name
      `);

      expect(interruptedMigrationRows).toEqual([
        { name: legacyMigration.name },
      ]);
      expect(interruptedTableRows).toEqual([
        { name: 'serviceFrontendReplicas' },
      ]);

      await db.run(sql`DROP TABLE serviceFrontendReplicas`);
      await Effect.runPromise(migratePartitionDbAsync({ db }));
      await Effect.runPromise(migratePartitionDbAsync({ db }));

      const completedMigrationRows = await db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );
      const completedTableRows = await db.all<{ name: string }>(sql`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'accountFrontendCommandJournal',
            'accountFrontendReplicas',
            'replicas',
            'serviceFrontendReplicas'
          )
        ORDER BY name
      `);

      expect(completedMigrationRows).toHaveLength(2);
      expect(completedMigrationRows[0]?.name).toMatch(/^20260707224326_/);
      expect(completedMigrationRows[1]?.name).toMatch(/^20260727223651_/);
      expect(completedTableRows).toEqual([
        { name: 'accountFrontendCommandJournal' },
        { name: 'accountFrontendReplicas' },
        { name: 'replicas' },
        { name: 'serviceFrontendReplicas' },
      ]);
    } finally {
      await client.sqlite3.close(client.db);
      await client.vfs.close();
    }
  });
});
