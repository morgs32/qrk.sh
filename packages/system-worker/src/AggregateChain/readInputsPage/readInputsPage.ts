import type { IDb } from '@zerospin/core/drizzle/types';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

type ICommandRow = typeof aggregateChainDbConfig.schema.commands.$inferSelect;
export type IChainInput = {
  kind: 'command';
  aggregateIndex: number;
  command: ICommandRow;
  originalResultSaved: boolean;
};
/** Original execution receives pending commands; other versions stop at the first unsaved input. */
export const readInputsPage = (props: {
  db: IDb<typeof aggregateChainDbConfig>;
  afterIndex: number;
  maxIndex?: number;
  subscriberKey?: Readonly<Record<string, string>>;
}) => {
  const { db, afterIndex, maxIndex, subscriberKey } = props;
  const tables = aggregateChainDbConfig.schema;
  const lastIndex =
    db
      .select({ index: tables.commands.aggregateIndex })
      .from(tables.commands)
      .orderBy(desc(tables.commands.aggregateIndex))
      .limit(1)
      .get()?.index ?? 0;
  const rows: { index: number; row: IChainInput }[] = [];
  if (subscriberKey === undefined) {
    return { rows, lastIndex };
  }
  for (const command of db
    .select()
    .from(tables.commands)
    .where(
      and(
        gt(tables.commands.aggregateIndex, afterIndex),
        maxIndex === undefined
          ? undefined
          : lte(tables.commands.aggregateIndex, maxIndex),
      ),
    )
    .orderBy(asc(tables.commands.aggregateIndex))
    .limit(64)
    .all()) {
    const result = db
      .select()
      .from(tables.results)
      .where(eq(tables.results.aggregateIndex, command.aggregateIndex))
      .get();
    if (
      result === undefined &&
      command.originalExecutionVersion !== subscriberKey.aggregateVersion
    ) {
      break;
    }
    rows.push({
      index: command.aggregateIndex,
      row: {
        kind: 'command',
        aggregateIndex: command.aggregateIndex,
        command,
        originalResultSaved: result !== undefined,
      },
    });
  }
  return { rows, lastIndex };
};
