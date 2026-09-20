import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IAnyModels } from '@zerospin/core/models/types';
import { AggregateSelectedCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Schema } from 'effect';

export const selectionVersionedAggregateRepoTables = {
  projectionState: makeTable({
    name: 'projectionState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      aggregateIndex: primitives.integer(),
      selectionIndex: primitives.integer(),
      selectionHash: primitives.text(),
      aggregateVersion: primitives.text(),
      canonicalBytes: primitives.text(),
      graph: primitives.json({ schema: Schema.Array(EncodedResourceSchema) }),
    },
  }),
  services: makeTable({
    name: 'services',
    shape: {
      serviceName: primitives.text({ nullable: false, unique: true }),
      lastIndex: primitives.integer(),
    },
  }),
  selectedCommands: makeTable({
    name: 'selectedCommands',
    shape: {
      outboxIndex: primitives.integer({ primaryKey: true }),
      output: primitives.json({
        schema: AggregateSelectedCommandSchema,
      }),
      authentication: primitives.json({
        schema: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
      }),
      frontendName: primitives.text({ nullable: true }),
      deliveredAt: primitives.date({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
};

export const selectionVersionedAggregateRepoDbConfig = makeDbConfig({
  tables: selectionVersionedAggregateRepoTables,
});

export class SelectionVersionedAggregateRepoDb extends Context.Service<
  SelectionVersionedAggregateRepoDb,
  IDb<
    IResourceDbConfig<IAnyModels, typeof selectionVersionedAggregateRepoTables>
  >
>()('@zerospin/system-worker/SelectionVersionedAggregateRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/SelectionVersionedAggregateRepoDb.Tx',
    ITx<
      IResourceDbConfig<
        IAnyModels,
        typeof selectionVersionedAggregateRepoTables
      >
    >
  >('@zerospin/system-worker/SelectionVersionedAggregateRepoDb.Tx');
}
