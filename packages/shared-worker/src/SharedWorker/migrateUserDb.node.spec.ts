import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/makeInMemorySQLite3';
import { makeWaSqliteDrizzle } from '@zerospin/core/drizzle/makeWaSqliteDrizzle';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { migrateUserDb } from './migrateUserDb.ts';
import { replicas, userDbConfig } from './userSchemas.ts';

describe('migrateUserDb', () => {
  it('creates replicas and records the init migration', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, userDbConfig);

    try {
      await Effect.runPromise(migrateUserDb({ db }));

      const rows = db.select().from(replicas).all();
      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(rows).toEqual([]);
      expect(migrationRows).toHaveLength(1);
      expect(migrationRows[0]?.name).toMatch(/^20260707224326_/);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('does not rerun an already recorded migration', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, userDbConfig);

    try {
      await Effect.runPromise(migrateUserDb({ db }));
      await Effect.runPromise(migrateUserDb({ db }));

      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(migrationRows).toHaveLength(1);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });

  it('does not treat the old table name as a migrated user db', async () => {
    const client = await makeInMemorySQLite3();
    const db = makeWaSqliteDrizzle(client, userDbConfig);
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

      await Effect.runPromise(migrateUserDb({ db }));

      const tableRows = db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      );
      const migrationRows = db.all<{ name: string | null }>(
        sql`SELECT name FROM __drizzle_migrations ORDER BY name`,
      );

      expect(tableRows.map(row => row.name)).toContain(oldTableName);
      expect(tableRows.map(row => row.name)).toContain('replicas');
      expect(migrationRows).toHaveLength(1);
    } finally {
      await client.sqlite3.close(client.db);
    }
  });
});
