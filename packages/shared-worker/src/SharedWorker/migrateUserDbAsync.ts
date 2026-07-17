import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import { makeTxAsync } from '../drizzle/makeTxAsync.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../drizzle/types.ts';

import { userMigrations } from './drizzle/user/migrations.ts';
import type { userDbConfig } from './userSchemas.ts';

const drizzleMigrationsTableName = '__drizzle_migrations';

export const migrateUserDbAsync = Effect.fn('migrateUserDbAsync')(
  function* (props: {
    db: IAsyncWaSqliteDrizzleDb<typeof userDbConfig>;
  }): Effect.fn.Return<void, IAnyError> {
    const { db } = props;

    yield* makeTxAsync({
      db,
      program: Effect.fn('migrateUserDbAsync.transaction')(function* ({ tx }) {
        yield* Effect.tryPromise({
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
            code: 'create-user-db-migrations-table-failed',
            message: 'Failed to create user DB migrations table',
            preferCauseMessage: false,
          }),
        });

        const migrationRows = yield* Effect.tryPromise({
          try: () =>
            tx.all<{ name: string | null }>(
              sql`SELECT name FROM ${sql.identifier(drizzleMigrationsTableName)}`,
            ),
          catch: ZerospinError.catch({
            code: 'read-user-db-migrations-failed',
            message: 'Failed to read user DB migrations',
            preferCauseMessage: false,
          }),
        });
        const appliedMigrationNames = new Set(
          migrationRows
            .map(row => row.name)
            .filter(name => typeof name === 'string'),
        );

        for (const migration of userMigrations) {
          if (appliedMigrationNames.has(migration.name)) {
            continue;
          }

          for (const statement of migration.sql) {
            yield* Effect.tryPromise({
              try: () => tx.run(sql.raw(statement)),
              catch: ZerospinError.catch({
                code: 'run-user-db-migration-statement-failed',
                message: `Failed to run user DB migration ${migration.name}`,
                preferCauseMessage: false,
              }),
            });
          }

          yield* Effect.tryPromise({
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
              code: 'insert-user-db-migration-row-failed',
              message: `Failed to record user DB migration ${migration.name}`,
              preferCauseMessage: false,
            }),
          });
        }
      }),
    });
  },
);
