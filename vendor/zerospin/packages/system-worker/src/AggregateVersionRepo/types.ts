import { type readAggregateVersionRepoOutput } from '../asyncOperations/readOperationOutput.js';

import type { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';
export type IExecutedCommandOutboxRow = Readonly<{
  kind: 'command';
  executedIndex: number;
  command: typeof aggregateVersionRepoDbConfig.schema.executedCommandOutbox.$inferSelect;
}>;
export type IExecutedCommandDelivery = IExecutedCommandOutboxRow &
  Readonly<{
    operations: ReturnType<typeof readAggregateVersionRepoOutput>;
  }>;
