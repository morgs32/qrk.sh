import type { IDb } from '@zerospin/core/drizzle/types';

import { readAggregateVersionChainOutput } from '../asyncOperations/readOperationOutput.js';
import { readOwnerResultsPage } from '../readOwnerResultsPage/readOwnerResultsPage.js';

import { aggregateVersionChainDbConfig } from './aggregateVersionChainDbConfig.js';

/** Page the merged owner order, attaching original operations only to aggregate results. */
export const readAggregateActorResultsPage = (props: {
  db: IDb<typeof aggregateVersionChainDbConfig>;
  afterIndex: number;
  maxIndex?: number;
}) => {
  const { db, ...page } = props;
  const { aggregateCommands } = aggregateVersionChainDbConfig.schema;
  const result = readOwnerResultsPage({
    db,
    commands: aggregateCommands,
    ...page,
  });
  return {
    ...result,
    rows: result.rows.map(entry => ({
      ...entry,
      row: {
        ...entry.row,
        operations: readAggregateVersionChainOutput(db, entry.row.command.id),
      },
    })),
  };
};
