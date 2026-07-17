import { makeTableMigrationStatements } from '@zerospin/core/drizzle/makeTableMigrationSQL';
import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql, type AnyRelations } from 'drizzle-orm';
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
        for (const statement of makeTableMigrationStatements(drizzleSchema)) {
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
