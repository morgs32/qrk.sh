import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

import { makeTxAsync } from '../drizzle/makeTxAsync.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../drizzle/types.ts';

import { userReplicaMigrations } from './drizzle/userReplica/migrations.ts';
import type { userReplicaDbConfig } from './userReplicaSchemas.ts';

const drizzleMigrationsTableName = '__drizzle_migrations';
const currentUserReplicaMigrationName = '20260811011400_user_replica_v1';

export const migrateUserReplicaDbAsync = Effect.fn('migrateUserReplicaDbAsync')(
  function* (props: {
    db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
    mode: 'create-or-open' | 'existing-only';
  }): Effect.fn.Return<void, IAnyError> {
    const { db, mode } = props;

    const currentUserReplicaMigration = userReplicaMigrations.find(
      migration => migration.name === currentUserReplicaMigrationName,
    );
    if (
      currentUserReplicaMigration === undefined ||
      userReplicaMigrations.length !== 1
    ) {
      return yield* new ZerospinError({
        code: 'user-replica-migration-manifest-invalid',
        message:
          'The browser user replica migration manifest must contain exactly the current baseline',
      });
    }

    const existingSchemaObjects = yield* Effect.tryPromise({
      try: () =>
        db.all<{
          type: string;
          name: string;
          tableName: string;
          definition: string | null;
        }>(sql`
          SELECT
            type,
            name,
            tbl_name AS "tableName",
            sql AS "definition"
          FROM sqlite_master
          WHERE type IN ('table', 'index', 'view', 'trigger')
            AND name NOT LIKE 'sqlite_%'
          ORDER BY type, name
        `),
      catch: ZerospinError.catch({
        code: 'inspect-user-replica-db-schema-failed',
        message: 'Failed to inspect the browser user replica schema',
        preferCauseMessage: false,
      }),
    });

    const [migrationColumns, migrationIndexes, migrationNameIndexColumns] =
      yield* Effect.tryPromise({
        try: () =>
          Promise.all([
            db.all<{
              cid: number;
              name: string;
              type: string;
              notnull: number;
              dflt_value: string | null;
              pk: number;
            }>(sql.raw(`PRAGMA table_info('${drizzleMigrationsTableName}')`)),
            db.all<{
              name: string;
              unique: number;
              origin: string;
              partial: number;
            }>(sql.raw(`PRAGMA index_list('${drizzleMigrationsTableName}')`)),
            db.all<{ seqno: number; cid: number; name: string }>(
              sql.raw(
                "PRAGMA index_info('sqlite_autoindex___drizzle_migrations_1')",
              ),
            ),
          ]),
        catch: ZerospinError.catch({
          code: 'inspect-user-replica-db-migration-state-failed',
          message: 'Failed to inspect browser user replica migration state',
          preferCauseMessage: false,
        }),
      });

    const hasCurrentMigrationTableShape =
      JSON.stringify(
        migrationColumns.map(column => ({
          ...column,
          type: column.type.toUpperCase(),
        })),
      ) ===
        JSON.stringify([
          {
            cid: 0,
            name: 'id',
            type: 'INTEGER',
            notnull: 0,
            dflt_value: null,
            pk: 1,
          },
          {
            cid: 1,
            name: 'hash',
            type: 'TEXT',
            notnull: 1,
            dflt_value: null,
            pk: 0,
          },
          {
            cid: 2,
            name: 'created_at',
            type: 'NUMERIC',
            notnull: 0,
            dflt_value: null,
            pk: 0,
          },
          {
            cid: 3,
            name: 'name',
            type: 'TEXT',
            notnull: 1,
            dflt_value: null,
            pk: 0,
          },
          {
            cid: 4,
            name: 'applied_at',
            type: 'TEXT',
            notnull: 1,
            dflt_value: null,
            pk: 0,
          },
        ]) &&
      JSON.stringify(
        migrationIndexes
          .map(index => ({
            name: index.name,
            unique: index.unique,
            origin: index.origin,
            partial: index.partial,
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      ) ===
        JSON.stringify([
          {
            name: 'sqlite_autoindex___drizzle_migrations_1',
            unique: 1,
            origin: 'u',
            partial: 0,
          },
        ]) &&
      JSON.stringify(migrationNameIndexColumns) ===
        JSON.stringify([{ seqno: 0, cid: 3, name: 'name' }]);

    const existingMigrationRows = yield* !hasCurrentMigrationTableShape
      ? Effect.succeed(
          new Array<{
            id: number;
            hash: string;
            created_at: number;
            name: string;
            applied_at: string;
          }>(),
        )
      : Effect.tryPromise({
          try: () =>
            db.all<{
              id: number;
              hash: string;
              created_at: number;
              name: string;
              applied_at: string;
            }>(
              sql`
                SELECT id, hash, created_at, name, applied_at
                FROM ${sql.identifier(drizzleMigrationsTableName)}
                ORDER BY id
              `,
            ),
          catch: ZerospinError.catch({
            code: 'read-user-replica-db-migrations-failed',
            message: 'Failed to read user replica DB migrations',
            preferCauseMessage: false,
          }),
        });

    const schemaObjectKeys = existingSchemaObjects.map(
      object => `${object.type}:${object.name}:${object.tableName}`,
    );
    const currentUserSchemaDefinitions = [
      existingSchemaObjects.find(
        object => object.name === 'aggregateFrontendReplicas',
      )?.definition,
      existingSchemaObjects.find(
        object => object.name === 'serviceFrontendReplicas',
      )?.definition,
      existingSchemaObjects.find(
        object => object.name === 'aggregate_frontend_replicas_target_lock_idx',
      )?.definition,
      existingSchemaObjects.find(
        object => object.name === 'service_frontend_replicas_target_lock_idx',
      )?.definition,
    ].map(definition => definition?.replace(/\s+/g, ' ').trim() ?? null);
    const expectedUserSchemaDefinitions = currentUserReplicaMigration.sql.map(
      statement => statement.replace(/;$/, '').replace(/\s+/g, ' ').trim(),
    );

    const currentMigrationRow = existingMigrationRows[0];
    const isEmptyDatabase = existingSchemaObjects.length === 0;
    const isCurrentDatabase =
      JSON.stringify(schemaObjectKeys) ===
        JSON.stringify([
          'index:aggregate_frontend_replicas_target_lock_idx:aggregateFrontendReplicas',
          'index:service_frontend_replicas_target_lock_idx:serviceFrontendReplicas',
          'table:__drizzle_migrations:__drizzle_migrations',
          'table:aggregateFrontendReplicas:aggregateFrontendReplicas',
          'table:serviceFrontendReplicas:serviceFrontendReplicas',
        ]) &&
      JSON.stringify(currentUserSchemaDefinitions) ===
        JSON.stringify(expectedUserSchemaDefinitions) &&
      hasCurrentMigrationTableShape &&
      existingMigrationRows.length === 1 &&
      currentMigrationRow?.id === 1 &&
      currentMigrationRow.hash === currentUserReplicaMigration.hash &&
      currentMigrationRow.created_at ===
        currentUserReplicaMigration.createdAt &&
      currentMigrationRow.name === currentUserReplicaMigrationName &&
      typeof currentMigrationRow.applied_at === 'string' &&
      currentMigrationRow.applied_at.length !== 0;

    if (!isEmptyDatabase && !isCurrentDatabase) {
      return yield* new ZerospinError({
        code: 'browser-persistence-reset-required',
        message:
          "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
      });
    }
    if (isCurrentDatabase) return;
    if (mode === 'existing-only') {
      return yield* new ZerospinError({
        code: 'browser-persistence-reset-required',
        message:
          "Browser persistence does not match this Zerospin build. Clear this site's browser data, then reload while online.",
      });
    }

    yield* makeTxAsync({
      db,
      program: Effect.fn('migrateUserReplicaDbAsync.transaction')(function* ({
        tx,
      }) {
        yield* Effect.tryPromise({
          try: () =>
            tx.run(sql`
              CREATE TABLE ${sql.identifier(drizzleMigrationsTableName)} (
                id INTEGER PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric,
                name text NOT NULL UNIQUE,
                applied_at TEXT NOT NULL
              )
            `),
          catch: ZerospinError.catch({
            code: 'create-user-replica-db-migrations-table-failed',
            message: 'Failed to create user replica DB migrations table',
            preferCauseMessage: false,
          }),
        });

        for (const migration of userReplicaMigrations) {
          for (const statement of migration.sql) {
            yield* Effect.tryPromise({
              try: () => tx.run(sql.raw(statement)),
              catch: ZerospinError.catch({
                code: 'run-user-replica-db-migration-statement-failed',
                message: `Failed to run user replica DB migration ${migration.name}`,
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
                )
              `),
            catch: ZerospinError.catch({
              code: 'insert-user-replica-db-migration-row-failed',
              message: `Failed to record user replica DB migration ${migration.name}`,
              preferCauseMessage: false,
            }),
          });
        }
      }),
    });
  },
);
