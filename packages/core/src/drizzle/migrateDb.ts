import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql, type AnyRelations } from 'drizzle-orm';
import { Effect } from 'effect';

import type { IAnyDrizzleSchemas } from '../models/types.ts';

import { makeTableMigrationStatements } from './makeTableMigrationSQL.ts';
import { makeTx } from './makeTx.ts';
import type { IDb, IDbConfig } from './types.ts';

export const migrateDb = Effect.fn('migrateDb')(function* <
  SCHEMA extends IAnyDrizzleSchemas,
  RELATIONS extends AnyRelations,
>(props: {
  db: IDb<IDbConfig<SCHEMA, RELATIONS>>;
  schema: SCHEMA;
}): Effect.fn.Return<void, IAnyError> {
  const { db, schema } = props;

  yield* makeTx({
    db,
    program: Effect.fn('transaction')(function* ({ tx }) {
      for (const drizzleSchema of Object.values(schema)) {
        for (const statement of makeTableMigrationStatements(drizzleSchema)) {
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
