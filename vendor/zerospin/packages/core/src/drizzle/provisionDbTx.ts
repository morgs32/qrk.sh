import { ZerospinError } from '@zerospin/error';
import { getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Context, Effect } from 'effect';

import { makeTableProvisioningStatements } from './makeTableProvisioningSQL.ts';
import { makeTx } from './makeTx.ts';
import type { IDb, IDbConfig, IDbConfigSchema, ITx } from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/drizzle/provisionDb/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/drizzle/provisionDb/Db.Tx',
    ITx
  >('core/src/drizzle/provisionDb/Db.Tx');
}

/** Provision missing tables and indexes atomically. */
export const provisionDbTx = makeTx(
  'provisionDbTx',
  Db,
)(function* (props: { schema: IDbConfigSchema<IDbConfig> }) {
  const { schema } = props;

  const tx = yield* Db.Tx;
  for (const drizzleSchema of Object.values(schema)) {
    const tableName = getTableName(drizzleSchema);
    const [existingTable] = tx.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
    );
    const statements = makeTableProvisioningStatements(drizzleSchema);

    if (existingTable?.name === undefined) {
      for (const statement of statements) {
        yield* Effect.try({
          try: () => tx.run(sql.raw(statement)),
          catch: ZerospinError.catch({
            code: 'provision-db-failed',
            message: 'Failed to provision db',
            preferCauseMessage: false,
          }),
        });
      }
      continue;
    }

    const tableConfig = getTableConfig(drizzleSchema);
    for (const index of tableConfig.indexes) {
      const [existingIndex] = tx.all<{ name: string }>(
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
          code: 'provision-db-index-statement-not-found',
          message: `Failed to find provisioning SQL for index ${index.config.name}`,
        });
      }
      yield* Effect.try({
        try: () => tx.run(sql.raw(statement)),
        catch: ZerospinError.catch({
          code: 'provision-db-failed',
          message: 'Failed to provision db',
          preferCauseMessage: false,
        }),
      });
    }
  }
});
