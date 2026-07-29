import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/makeInMemorySQLite3';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/makeWaSqliteDrizzle';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { partitionMigrations } from './drizzle/partition/migrations.ts';
import { migratePartitionDb } from './migratePartitionDb.ts';
import {
  accountFrontendCommandJournal,
  accountFrontendReplicas,
  partitionDbConfig,
  replicas,
  serviceFrontendReplicas,
} from './partitionSchemas.ts';

describe('migratePartitionDb', () => {
  it('retains legacy replicas, creates the separate catalogs and journal, and records both migrations', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, partitionDbConfig);

    try {
      db.run(sql`
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
      for (const statement of legacyMigration.sql) {
        db.run(sql.raw(statement));
      }
      db.run(sql`
        INSERT INTO __drizzle_migrations
          (hash, created_at, name, applied_at)
        VALUES
          (${legacyMigration.hash}, ${legacyMigration.createdAt}, ${legacyMigration.name}, ${new Date().toISOString()});
      `);
      db.insert(replicas)
        .values({
          id: 'frp_legacy',
          accountId: 'acct_legacy',
          accountName: 'user',
          actorId: 'actr_legacy',
          actorName: 'shopper',
          frontendName: 'web',
          frontendVersion: '1.0.0',
          databaseName: 'legacy-replica.db',
        })
        .run();

      await Effect.runPromise(migratePartitionDb({ db }));

      const legacyRows = db.select().from(replicas).all();
      const accountRows = db.select().from(accountFrontendReplicas).all();
      const serviceRows = db.select().from(serviceFrontendReplicas).all();
      const journalRows = db.select().from(accountFrontendCommandJournal).all();
      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(legacyRows).toEqual([
        {
          id: 'frp_legacy',
          accountId: 'acct_legacy',
          accountName: 'user',
          actorId: 'actr_legacy',
          actorName: 'shopper',
          frontendName: 'web',
          frontendVersion: '1.0.0',
          databaseName: 'legacy-replica.db',
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
    }
  });

  it('does not rerun an already recorded migration', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, partitionDbConfig);

    try {
      await Effect.runPromise(migratePartitionDb({ db }));
      await Effect.runPromise(migratePartitionDb({ db }));

      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(migrationRows).toHaveLength(2);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('does not treat the old table name as a migrated partition db', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, partitionDbConfig);
    const oldTableName = 'frontendReplicas';

    try {
      db.run(
        sql.raw(`
          CREATE TABLE "${oldTableName}" (
            id text PRIMARY KEY,
            frontendName text NOT NULL,
            frontendVersion text NOT NULL,
            databaseName text NOT NULL
          );
        `),
      );

      await Effect.runPromise(migratePartitionDb({ db }));

      const tableRows = db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      );
      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(tableRows.map(row => row.name)).toContain(oldTableName);
      expect(tableRows.map(row => row.name)).toContain('replicas');
      expect(tableRows.map(row => row.name)).toContain(
        'accountFrontendReplicas',
      );
      expect(tableRows.map(row => row.name)).toContain(
        'serviceFrontendReplicas',
      );
      expect(tableRows.map(row => row.name)).toContain(
        'accountFrontendCommandJournal',
      );
      expect(migrationRows).toHaveLength(2);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });
});
