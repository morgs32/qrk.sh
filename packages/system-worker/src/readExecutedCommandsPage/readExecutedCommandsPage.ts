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
export function readExecutedCommandsPage<
  AGGREGATE extends SQLiteTable & {
    executedIndex: AnySQLiteColumn<{ data: number; notNull: true }>;
  },
  SERVICE extends SQLiteTable & {
    executedIndex: AnySQLiteColumn<{ data: number; notNull: true }>;
  },
>(props: {
  db: IDb;
  aggregateCommands: AGGREGATE;
  serviceCommands: SERVICE;
  afterIndex: number;
  maxIndex?: number;
  aggregateWhere?: SQL;
  serviceWhere?: SQL;
}) {
  const {
    db,
    aggregateCommands,
    serviceCommands,
    afterIndex,
    maxIndex,
    aggregateWhere,
    serviceWhere,
  } = props;
  const aggregateRows = db
    .select({
      row: getTableColumns(aggregateCommands),
      index: aggregateCommands.executedIndex,
    })
    .from(aggregateCommands)
    .where(
      and(
        gt(aggregateCommands.executedIndex, afterIndex),
        maxIndex === undefined
          ? undefined
          : lte(aggregateCommands.executedIndex, maxIndex),
        aggregateWhere,
      ),
    )
    .orderBy(asc(aggregateCommands.executedIndex))
    .limit(64)
    .all();
  const serviceRows = db
    .select({
      row: getTableColumns(serviceCommands),
      index: serviceCommands.executedIndex,
    })
    .from(serviceCommands)
    .where(
      and(
        gt(serviceCommands.executedIndex, afterIndex),
        maxIndex === undefined
          ? undefined
          : lte(serviceCommands.executedIndex, maxIndex),
        serviceWhere,
      ),
    )
    .orderBy(asc(serviceCommands.executedIndex))
    .limit(64)
    .all();
  const aggregateTip =
    db
      .select({ index: aggregateCommands.executedIndex })
      .from(aggregateCommands)
      .orderBy(desc(aggregateCommands.executedIndex))
      .limit(1)
      .get()?.index ?? 0;
  const serviceTip =
    db
      .select({ index: serviceCommands.executedIndex })
      .from(serviceCommands)
      .orderBy(desc(serviceCommands.executedIndex))
      .limit(1)
      .get()?.index ?? 0;
  return {
    rows: [...aggregateRows, ...serviceRows]
      .sort((left, right) => left.index - right.index)
      .slice(0, 64),
    lastIndex: Math.max(aggregateTip, serviceTip),
  };
}
