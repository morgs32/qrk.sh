import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Context } from 'effect';

export const versionedServiceRepoTables = {
  head: makeTable({
    name: 'head',
    shape: {
      singletonId: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer(),
      dispositionHash: primitives.text(),
    },
  }),
  results: makeTable({
    name: 'results',
    shape: {
      outboxIndex: primitives.integer({ primaryKey: true }),
      entry: primitives.json({ schema: ServiceExecutionEntrySchema }),
      executionVersion: primitives.text(),
      deliveredAt: primitives.date({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const versionedServiceRepoDbConfig = makeDbConfig({
  tables: versionedServiceRepoTables,
});

export class VersionedServiceRepoDb extends Context.Service<
  VersionedServiceRepoDb,
  IDb<IResourceDbConfig<IAnyModels, typeof versionedServiceRepoTables>>
>()('@zerospin/system-worker/VersionedServiceRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/VersionedServiceRepoDb.Tx',
    ITx<IResourceDbConfig<IAnyModels, typeof versionedServiceRepoTables>>
  >('@zerospin/system-worker/VersionedServiceRepoDb.Tx');
}
