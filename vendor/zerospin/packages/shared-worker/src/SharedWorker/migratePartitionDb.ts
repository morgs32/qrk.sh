import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IWaSqliteDrizzleDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import { partitionMigrations } from './drizzle/partition/migrations.ts';
import type { partitionDbConfig } from './partitionSchemas.ts';

const drizzleMigrationsTableName = '__drizzle_migrations';

export const migratePartitionDb = Effect.fn('migratePartitionDb')(
  function* (props: {
    db: IWaSqliteDrizzleDb<typeof partitionDbConfig>;
  }): Effect.fn.Return<void, IAnyError> {
    const { db } = props;

    yield* makeTx({
      db,
      program: Effect.fn('migratePartitionDb.transaction')(function* ({ tx }) {
        yield* Effect.try({
          try: () =>
            tx.run(sql`
              CREATE TABLE IF NOT EXISTS ${sql.identifier(drizzleMigrationsTableName)} (
                id INTEGER PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric,
                name text,
                applied_at TEXT
              );
            `),
          catch: ZerospinError.catch({
            code: 'create-partition-db-migrations-table-failed',
            message: 'Failed to create partition DB migrations table',
            preferCauseMessage: false,
          }),
        });

        const migrationRows = yield* Effect.try({
          try: () =>
            tx.all<{ name: string | null }>(
              sql`SELECT name FROM ${sql.identifier(drizzleMigrationsTableName)}`,
            ),
          catch: ZerospinError.catch({
            code: 'read-partition-db-migrations-failed',
            message: 'Failed to read partition DB migrations',
            preferCauseMessage: false,
          }),
        });
        const appliedMigrationNames = new Set(
          migrationRows
            .map(row => row.name)
            .filter(name => typeof name === 'string'),
        );

        for (const migration of partitionMigrations) {
          if (appliedMigrationNames.has(migration.name)) {
            continue;
          }

          for (const statement of migration.sql) {
            yield* Effect.try({
              try: () => tx.run(sql.raw(statement)),
              catch: ZerospinError.catch({
                code: 'run-partition-db-migration-statement-failed',
                message: `Failed to run partition DB migration ${migration.name}`,
                preferCauseMessage: false,
              }),
            });
          }

          yield* Effect.try({
            try: () =>
              tx.run(sql`
                INSERT INTO ${sql.identifier(drizzleMigrationsTableName)}
                  ("hash", "created_at", "name", "applied_at")
                VALUES (
                  ${migration.hash},
                  ${migration.createdAt},
                  ${migration.name},
                  ${new Date().toISOString()}
                );
              `),
            catch: ZerospinError.catch({
              code: 'insert-partition-db-migration-row-failed',
              message: `Failed to record partition DB migration ${migration.name}`,
              preferCauseMessage: false,
            }),
          });
        }
      }),
    });
  },
);
