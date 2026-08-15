import { readFile } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import { Effect, Either } from 'effect';
import { describe, expect, it } from 'vitest';
import * as SQLite from 'wa-sqlite';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
// oxlint-disable-next-line eslint/no-restricted-imports -- this test requires wa-sqlite's real in-memory Asyncify VFS.
import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';

import { makeAsyncWaSqliteDrizzle } from '../drizzle/makeAsyncWaSqliteDrizzle.ts';

import { userReplicaMigrations } from './drizzle/userReplica/migrations.ts';
import { migrateUserReplicaDbAsync } from './migrateUserReplicaDbAsync.ts';
import { userReplicaDbConfig } from './userReplicaSchemas.ts';

describe('migrateUserReplicaDbAsync', () => {
  it('creates only the current user-root schema and rejects any later divergence', async () => {
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
      'current-user-replica.db',
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name,
    );
    const client = { sqlite3, db: sqliteDb, vfs };
    const db = makeAsyncWaSqliteDrizzle(client, userReplicaDbConfig);

    try {
      const emptyExistingOnlyResult = await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'existing-only' }).pipe(
          Effect.either,
        ),
      );
      expect(Either.isLeft(emptyExistingOnlyResult)).toBe(true);
      if (Either.isLeft(emptyExistingOnlyResult)) {
        expect(emptyExistingOnlyResult.left).toMatchObject({
          code: 'browser-persistence-reset-required',
        });
      }
      expect(
        await db.all(sql`
          SELECT type, name
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      ).toEqual([]);

      await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }),
      );
      await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }),
      );

      const currentSchemaBeforeExistingOnly = await db.all(sql`
        SELECT type, name, tbl_name AS "tableName", sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);
      const currentReceiptBeforeExistingOnly = await db.all(sql`
        SELECT id, hash, created_at, name, applied_at
        FROM __drizzle_migrations
        ORDER BY id
      `);
      await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'existing-only' }),
      );
      expect(
        await db.all(sql`
          SELECT type, name, tbl_name AS "tableName", sql
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      ).toEqual(currentSchemaBeforeExistingOnly);
      expect(
        await db.all(sql`
          SELECT id, hash, created_at, name, applied_at
          FROM __drizzle_migrations
          ORDER BY id
        `),
      ).toEqual(currentReceiptBeforeExistingOnly);

      expect(
        await db.all<{
          id: number;
          hash: string;
          created_at: number;
          name: string;
          applied_at: string;
        }>(
          sql`
            SELECT id, hash, created_at, name, applied_at
            FROM __drizzle_migrations
            ORDER BY id
          `,
        ),
      ).toEqual(
        userReplicaMigrations.map((migration, index) => ({
          id: index + 1,
          hash: migration.hash,
          created_at: migration.createdAt,
          name: migration.name,
          applied_at: expect.any(String),
        })),
      );
      expect(
        await db.all<{ type: string; name: string; tableName: string }>(sql`
          SELECT type, name, tbl_name AS "tableName"
          FROM sqlite_master
          WHERE type IN ('table', 'index', 'view', 'trigger')
            AND name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      ).toEqual([
        {
          type: 'index',
          name: 'aggregate_frontend_replicas_target_lock_idx',
          tableName: 'aggregateFrontendReplicas',
        },
        {
          type: 'index',
          name: 'service_frontend_replicas_target_lock_idx',
          tableName: 'serviceFrontendReplicas',
        },
        {
          type: 'table',
          name: '__drizzle_migrations',
          tableName: '__drizzle_migrations',
        },
        {
          type: 'table',
          name: 'aggregateFrontendReplicas',
          tableName: 'aggregateFrontendReplicas',
        },
        {
          type: 'table',
          name: 'serviceFrontendReplicas',
          tableName: 'serviceFrontendReplicas',
        },
      ]);
      expect(
        await db.get<{ sql: string }>(sql`
          SELECT sql
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'aggregate_frontend_replicas_target_lock_idx'
        `),
      ).toMatchObject({ sql: expect.stringContaining('CREATE UNIQUE INDEX') });
      expect(
        await db.get<{ sql: string }>(sql`
          SELECT sql
          FROM sqlite_master
          WHERE type = 'index'
            AND name = 'service_frontend_replicas_target_lock_idx'
        `),
      ).toMatchObject({ sql: expect.stringContaining('CREATE UNIQUE INDEX') });

      await db.run(
        sql`CREATE VIEW unexpectedView AS SELECT 'keep-me' AS value`,
      );
      const schemaWithViewBefore = await db.all<{
        type: string;
        name: string;
        sql: string;
      }>(sql`
        SELECT type, name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);
      const extraObjectResult = await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }).pipe(
          Effect.either,
        ),
      );

      expect(Either.isLeft(extraObjectResult)).toBe(true);
      if (Either.isLeft(extraObjectResult)) {
        expect(extraObjectResult.left).toMatchObject({
          code: 'browser-persistence-reset-required',
        });
      }
      expect(
        await db.all(sql`
          SELECT type, name, sql
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      ).toEqual(schemaWithViewBefore);

      await db.run(sql`DROP VIEW unexpectedView`);
      await db.run(
        sql`UPDATE __drizzle_migrations SET hash = 'forged-current-hash'`,
      );
      const forgedReceiptBefore = await db.all(sql`
        SELECT id, hash, created_at, name, applied_at
        FROM __drizzle_migrations
        ORDER BY id
      `);
      const forgedReceiptResult = await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }).pipe(
          Effect.either,
        ),
      );

      expect(Either.isLeft(forgedReceiptResult)).toBe(true);
      if (Either.isLeft(forgedReceiptResult)) {
        expect(forgedReceiptResult.left).toMatchObject({
          code: 'browser-persistence-reset-required',
        });
      }
      expect(
        await db.all(sql`
          SELECT id, hash, created_at, name, applied_at
          FROM __drizzle_migrations
          ORDER BY id
        `),
      ).toEqual(forgedReceiptBefore);
    } finally {
      await client.sqlite3.close(client.db);
      await client.vfs.close();
    }
  });

  it('rejects a view-only database without treating it as empty', async () => {
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
      'incompatible-user-replica.db',
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name,
    );
    const client = { sqlite3, db: sqliteDb, vfs };
    const db = makeAsyncWaSqliteDrizzle(client, userReplicaDbConfig);

    try {
      await db.run(
        sql`CREATE VIEW unexpectedView AS SELECT 'keep-me' AS value`,
      );
      const schemaBefore = await db.all<{
        type: string;
        name: string;
        sql: string;
      }>(sql`
        SELECT type, name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);

      const result = await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }).pipe(
          Effect.either,
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({
          code: 'browser-persistence-reset-required',
        });
        expect(result.left.message).toContain("Clear this site's browser data");
      }
      expect(
        await db.all(sql`
          SELECT type, name, sql
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      ).toEqual(schemaBefore);
      expect(await db.all(sql`SELECT value FROM unexpectedView`)).toEqual([
        { value: 'keep-me' },
      ]);
    } finally {
      await client.sqlite3.close(client.db);
      await client.vfs.close();
    }
  });

  it('rejects the old Drizzle receipt shape as reset-required before mutation', async () => {
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
      'non-current-user-replica.db',
      SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE,
      vfs.name,
    );
    const client = { sqlite3, db: sqliteDb, vfs };
    const db = makeAsyncWaSqliteDrizzle(client, userReplicaDbConfig);

    try {
      await db.run(sql`
        CREATE TABLE __drizzle_migrations (
          id INTEGER PRIMARY KEY,
          hash text NOT NULL,
          created_at numeric
        )
      `);
      await db.run(sql`
        INSERT INTO __drizzle_migrations
          (hash, created_at)
        VALUES ('old-hash', 1)
      `);
      await db.run(sql`CREATE TABLE unexpectedTable (value text NOT NULL)`);
      await db.run(sql`INSERT INTO unexpectedTable (value) VALUES ('keep-me')`);
      const schemaBefore = await db.all<{ name: string; sql: string }>(sql`
        SELECT name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      const result = await Effect.runPromise(
        migrateUserReplicaDbAsync({ db, mode: 'create-or-open' }).pipe(
          Effect.either,
        ),
      );

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toMatchObject({
          code: 'browser-persistence-reset-required',
        });
      }
      expect(
        await db.all(sql`
          SELECT name, sql
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY name
        `),
      ).toEqual(schemaBefore);
      expect(
        await db.all(sql`
          SELECT hash, created_at
          FROM __drizzle_migrations
          ORDER BY id
        `),
      ).toEqual([
        {
          hash: 'old-hash',
          created_at: 1,
        },
      ]);
    } finally {
      await client.sqlite3.close(client.db);
      await client.vfs.close();
    }
  });
});
