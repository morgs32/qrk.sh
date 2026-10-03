import type { IDb } from '@zerospin/core/drizzle/types';
import {
  and,
  asc,
  desc,
  getTableColumns,
  gt,
  lte,
  type SQL,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

/** Read a globally ordered suffix while retaining the complete row from each source table. */
export function readOwnerResultsPage<
  COMMAND extends SQLiteTable & {
    executedIndex: AnySQLiteColumn<{ data: number; notNull: true }>;
  },
>(props: {
  db: IDb;
  commands: COMMAND;
  afterIndex: number;
  maxIndex?: number;
  commandWhere?: SQL;
}) {
  const { db, commands, afterIndex, maxIndex, commandWhere } = props;
  const commandRows = db
    .select({
      row: getTableColumns(commands),
      index: commands.executedIndex,
    })
    .from(commands)
    .where(
      and(
        gt(commands.executedIndex, afterIndex),
        maxIndex === undefined
          ? undefined
          : lte(commands.executedIndex, maxIndex),
        commandWhere,
      ),
    )
    .orderBy(asc(commands.executedIndex))
    .limit(64)
    .all();
  const commandTip =
    db
      .select({ index: commands.executedIndex })
      .from(commands)
      .orderBy(desc(commands.executedIndex))
      .limit(1)
      .get()?.index ?? 0;
  return {
    rows: commandRows
      .map(entry => ({
        index: entry.index,
        row: {
          kind: 'command' as const,
          executedIndex: entry.index,
          command: entry.row,
        },
      }))
      .sort((left, right) => left.index - right.index)
      .slice(0, 64),
    lastIndex: commandTip,
  };
}
