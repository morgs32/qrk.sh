/*
 * System-worker annotation:
 * Reads one registered repo table for Studio without accepting arbitrary SQL.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { Effect } from 'effect';

/*
 * Repo inspection resolves a physical table name only from the supplied
 * schema. It returns SQLite column metadata and rows for Studio inspection.
 *
 * 1. Resolve the requested physical table.
 * 2. Reject tables outside this Repo.
 * 3. Describe physical columns.
 * 4. Read the selected table rows.
 * 5. Return the inspection result.
 */
export const getRepoTableRows = Effect.fn('Repo.getRepoTableRows')(
  function* (props: {
    db: IDb;
    schema: IAnyDrizzleSchemas;
    tableName: string;
  }) {
    const { db, schema, tableName } = props;

    // 1 — match getTableName against tables in the bound schema
    const table = Object.values(schema).find(
      candidate => getTableName(candidate) === tableName,
    );

    // 2 — return repo-explorer-table-not-found
    if (table === undefined) {
      return yield* new ZerospinError({
        code: 'repo-explorer-table-not-found',
        message: `Table "${tableName}" is not registered on this repo`,
        extra: { tableName },
      });
    }

    // 3 — report name, SQL type, primary-key flag, and nullability
    const columns = Object.values(getTableColumns(table)).map(column => ({
      name: column.name,
      type: column.getSQLType(),
      isPrimaryKey: column.primary,
      isNullable: !column.notNull,
    }));

    // 4 — select all rows from the resolved Drizzle table
    const rows = db.select().from(table).all();

    // 5 — pair column metadata with the selected rows
    return { columns, rows } satisfies IRepoTableData;
  },
);
