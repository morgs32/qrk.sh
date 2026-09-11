import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IAnyModels } from '@zerospin/core/models/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Schema } from 'effect';

export const authenticatedVersionedAggregateRepoTables = {
  projectionState: makeTable({
    name: 'projectionState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      aggregateIndex: primitives.integer(),
      userIndex: primitives.integer(),
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
  deltas: makeTable({
    name: 'deltas',
    shape: {
      outboxIndex: primitives.integer({ primaryKey: true }),
      output: primitives.json({
        schema: AggregateFrontendFinalizedCommandSchema,
      }),
      deliveredAt: primitives.date({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
};

export const authenticatedVersionedAggregateRepoDbConfig = makeDbConfig({
  tables: authenticatedVersionedAggregateRepoTables,
});

export class AuthenticatedVersionedAggregateRepoDb extends Context.Service<
  AuthenticatedVersionedAggregateRepoDb,
  IDb<
    IResourceDbConfig<
      IAnyModels,
      typeof authenticatedVersionedAggregateRepoTables
    >
  >
>()('@zerospin/system-worker/AuthenticatedVersionedAggregateRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/AuthenticatedVersionedAggregateRepoDb.Tx',
    ITx<
      IResourceDbConfig<
        IAnyModels,
        typeof authenticatedVersionedAggregateRepoTables
      >
    >
  >('@zerospin/system-worker/AuthenticatedVersionedAggregateRepoDb.Tx');
}
