import type { aggregateVersionRepoDbConfig } from './aggregateVersionRepoDbConfig.js';

export type IExecutedCommandOutboxRow =
  | typeof aggregateVersionRepoDbConfig.schema.aggregateCommands.$inferSelect
  | typeof aggregateVersionRepoDbConfig.schema.serviceCommands.$inferSelect;

export type IExecutedCommandDelivery = IExecutedCommandOutboxRow & {
  mutations: readonly (typeof aggregateVersionRepoDbConfig.schema.mutations.$inferSelect)[];
};
