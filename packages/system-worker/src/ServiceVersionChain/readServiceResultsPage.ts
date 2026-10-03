import type { IDb } from '@zerospin/core/drizzle/types';
import { and, asc, desc, gt, lte } from 'drizzle-orm';

import { readServiceVersionChainOutput } from '../asyncOperations/readOperationOutput.js';

import { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';
type ICommand = typeof serviceVersionChainDbConfig.schema.commands.$inferSelect;
type IOperation = ReturnType<typeof readServiceVersionChainOutput>[number];
export type IServiceResult = Readonly<{
  kind: 'command';
  executedIndex: number;
  command: ICommand;
  operations: readonly IOperation[];
}>;
/** Page the single retained local execution order without copying operation bodies. */
export const readServiceResultsPage = (props: {
  db: IDb<typeof serviceVersionChainDbConfig>;
  afterIndex: number;
  maxIndex?: number;
}): {
  rows: readonly {
    index: number;
    row: IServiceResult;
  }[];
  lastIndex: number;
} => {
  const { db, afterIndex, maxIndex } = props;
  const { commands } = serviceVersionChainDbConfig.schema;
  return {
    rows: db
      .select()
      .from(commands)
      .where(
        and(
          gt(commands.executedIndex, afterIndex),
          maxIndex === undefined
            ? undefined
            : lte(commands.executedIndex, maxIndex),
        ),
      )
      .orderBy(asc(commands.executedIndex))
      .limit(64)
      .all()
      .map(command => {
        return {
          index: command.executedIndex,
          row: {
            kind: 'command' as const,
            executedIndex: command.executedIndex,
            command,
            operations: readServiceVersionChainOutput(db, command.id),
          },
        };
      }),
    lastIndex:
      db
        .select({ index: commands.executedIndex })
        .from(commands)
        .orderBy(desc(commands.executedIndex))
        .limit(1)
        .get()?.index ?? 0,
  };
};
