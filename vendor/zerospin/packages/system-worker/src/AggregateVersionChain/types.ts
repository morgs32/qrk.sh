import { type readAggregateVersionChainOutput } from '../asyncOperations/readOperationOutput.js';

import type { aggregateVersionChainDbConfig } from './aggregateVersionChainDbConfig.js';
export type IResolvedExecutedCommandRow = Readonly<{
  kind: 'command';
  executedIndex: number;
  command: typeof aggregateVersionChainDbConfig.schema.aggregateCommands.$inferSelect;
  operations: ReturnType<typeof readAggregateVersionChainOutput>;
}>;
export type IExecutedCommandRow =
  | IResolvedExecutedCommandRow
  | typeof aggregateVersionChainDbConfig.schema.aggregateCommands.$inferSelect;
