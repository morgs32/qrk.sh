import type { aggregateVersionChainDbConfig } from './aggregateVersionChainDbConfig.js';

export type IExecutedCommandRow =
  | typeof aggregateVersionChainDbConfig.schema.aggregateCommands.$inferSelect
  | typeof aggregateVersionChainDbConfig.schema.serviceCommands.$inferSelect;
