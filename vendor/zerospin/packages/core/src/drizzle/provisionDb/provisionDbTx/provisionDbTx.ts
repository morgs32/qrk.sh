import { catchZerospinError, makeZerospinError } from '@zerospin/error';
import { getTableName, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';

import { makeTx } from '../../make/makeTx.ts';
import type { IDbConfig, IDbConfigSchema, ITx } from '../../types.ts';

import { makeTableProvisioningStatements } from './makeTableProvisioningSQL/makeTableProvisioningSQL.ts';

/** Provision missing tables and indexes atomically. */
export const provisionDbTx = makeTx('provisionDbTx')(function* (
  tx: ITx,
  props: { schema: IDbConfigSchema<IDbConfig> },
) {
  const { schema } = props;

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
          catch: catchZerospinError({
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
        return yield* Effect.fail(
          makeZerospinError({
            code: 'provision-db-index-statement-not-found',
            message: `Failed to find provisioning SQL for index ${index.config.name}`,
          }),
        );
      }
      yield* Effect.try({
        try: () => tx.run(sql.raw(statement)),
        catch: catchZerospinError({
          code: 'provision-db-failed',
          message: 'Failed to provision db',
          preferCauseMessage: false,
        }),
      });
    }
  }
});
