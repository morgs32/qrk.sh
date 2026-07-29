import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { getTableName, sql, type AnyRelations } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';

import { makeTxAsync } from './makeTxAsync.ts';
import type { IAsyncDb, IDbConfig } from './types.ts';

export const migrateDbAsync = Effect.fn('migrateDbAsync')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
>(props: {
  db: IAsyncDb<IDbConfig<SCHEMA, RELATIONS>>;
  schema: SCHEMA;
}): Effect.fn.Return<void, IAnyError> {
  const { db, schema } = props;

  yield* makeTxAsync({
    db,
    program: Effect.fn('transaction')(function* ({ tx }) {
      for (const drizzleSchema of Object.values(schema)) {
        const tableName = getTableName(drizzleSchema);
        const existingTable = yield* Effect.tryPromise({
          try: () =>
            tx.get<{ name: string | undefined }>(
              sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
            ),
          catch: ZerospinError.catch({
            code: 'migrate-db-failed',
            message: 'Failed to inspect db table',
            preferCauseMessage: false,
          }),
        });
        const statements = makeTableMigrationStatements(drizzleSchema);

        if (existingTable?.name === undefined) {
          for (const statement of statements) {
            yield* Effect.tryPromise({
              try: () => tx.run(sql.raw(statement)),
              catch: ZerospinError.catch({
                code: 'migrate-db-failed',
                message: 'Failed to migrate db',
                preferCauseMessage: false,
              }),
            });
          }
          continue;
        }

        const tableConfig = getTableConfig(drizzleSchema);
        for (const index of tableConfig.indexes) {
          const existingIndex = yield* Effect.tryPromise({
            try: () =>
              tx.get<{ name: string | undefined }>(
                sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${index.config.name}`,
              ),
            catch: ZerospinError.catch({
              code: 'migrate-db-failed',
              message: 'Failed to inspect db index',
              preferCauseMessage: false,
            }),
          });
          if (existingIndex?.name !== undefined) {
            continue;
          }
          const statement = statements.find(candidate =>
            candidate.includes(`INDEX ${index.config.name} ON `),
          );
          if (statement === undefined) {
            return yield* new ZerospinError({
              code: 'migrate-db-index-statement-not-found',
              message: `Failed to find migration SQL for index ${index.config.name}`,
            });
          }
          yield* Effect.tryPromise({
            try: () => tx.run(sql.raw(statement)),
            catch: ZerospinError.catch({
              code: 'migrate-db-failed',
              message: 'Failed to migrate db',
              preferCauseMessage: false,
            }),
          });
        }
      }
    }),
  });
});
