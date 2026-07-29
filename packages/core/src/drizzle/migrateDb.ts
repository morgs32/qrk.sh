import { ZerospinError, type IAnyError } from '@zerospin/error';
import { getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';

import { makeTableMigrationStatements } from './makeTableMigrationSQL.ts';
import { makeTx } from './makeTx.ts';
import type { IDb, IDbConfig, IDbConfigSchema } from './types.ts';

export const migrateDb = Effect.fn('migrateDb')(function* <
  CONFIG extends IDbConfig,
>(props: {
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}): Effect.fn.Return<void, IAnyError> {
  const { db, schema } = props;

  yield* makeTx({
    db,
    program: Effect.fn('transaction')(function* ({ tx }) {
      for (const drizzleSchema of Object.values(schema)) {
        const tableName = getTableName(drizzleSchema);
        const existingTable = tx.get<{ name: string | undefined }>(
          sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
        );
        const statements = makeTableMigrationStatements(drizzleSchema);

        if (existingTable?.name === undefined) {
          for (const statement of statements) {
            yield* Effect.try({
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
          const existingIndex = tx.get<{ name: string | undefined }>(
            sql`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${index.config.name}`,
          );
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
          yield* Effect.try({
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
