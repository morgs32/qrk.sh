/*
 * System-worker annotation:
 * Reads one registered repo table for Studio without accepting arbitrary SQL.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchemas } from '@zerospin/core/models/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { Effect } from 'effect';

export const getRepoTableRows = Effect.fn('Repo.getRepoTableRows')(
  function* (props: {
    db: IDb;
    schema: IAnyDrizzleSchemas;
    tableName: string;
  }) {
    const { db, schema, tableName } = props;
    const table = Object.values(schema).find(
      candidate => getTableName(candidate) === tableName,
    );

    if (table === undefined) {
      return yield* new ZerospinError({
        code: 'repo-explorer-table-not-found',
        message: `Table "${tableName}" is not registered on this repo`,
        extra: { tableName },
      });
    }

    const columns = Object.values(getTableColumns(table)).map(column => ({
      name: column.name,
      type: column.getSQLType(),
      isPrimaryKey: column.primary,
      isNullable: !column.notNull,
    }));
    const rows = db.select().from(table).all();

    return { columns, rows } satisfies IRepoTableData;
  },
);
