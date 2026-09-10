import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Context } from 'effect';

export const versionedAggregateRepoTables = {
  services: makeTable({
    name: 'services',
    shape: {
      serviceName: primitives.text({ nullable: false, unique: true }),
      lastIndex: primitives.integer(),
    },
  }),
  head: makeTable({
    name: 'head',
    shape: {
      singletonId: primitives.integer({ primaryKey: true }),
      aggregateIndex: primitives.integer(),
      dispositionHash: primitives.text(),
    },
  }),
  executedCommands: makeTable({
    name: 'executedCommands',
    shape: {
      outboxIndex: primitives.integer({ primaryKey: true }),
      entry: primitives.json({ schema: AggregateExecutionEntrySchema }),
      executionVersion: primitives.text(),
      deliveredAt: primitives.date({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const versionedAggregateRepoDbConfig = makeDbConfig({
  tables: versionedAggregateRepoTables,
});

export class VersionedAggregateRepoDb extends Context.Service<
  VersionedAggregateRepoDb,
  IDb<IResourceDbConfig<IAnyModels, typeof versionedAggregateRepoTables>>
>()('@zerospin/system-worker/VersionedAggregateRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/VersionedAggregateRepoDb.Tx',
    ITx<IResourceDbConfig<IAnyModels, typeof versionedAggregateRepoTables>>
  >('@zerospin/system-worker/VersionedAggregateRepoDb.Tx');
}
