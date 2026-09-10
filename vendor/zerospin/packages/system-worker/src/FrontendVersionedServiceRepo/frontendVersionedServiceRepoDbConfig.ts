import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IAnyModels } from '@zerospin/core/models/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Schema } from 'effect';

export const frontendVersionedServiceRepoTables = {
  projectionState: makeTable({
    name: 'projectionState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer(),
      serviceVersion: primitives.text(),
      canonicalBytes: primitives.text(),
      graph: primitives.json({ schema: Schema.Array(EncodedResourceSchema) }),
    },
  }),
  deltas: makeTable({
    name: 'deltas',
    shape: {
      outboxIndex: primitives.integer({ primaryKey: true }),
      output: primitives.json({
        schema: ServiceFrontendFinalizedCommandSchema,
      }),
      deliveredAt: primitives.date({ nullable: true }),
      lastDeliveryFailure: primitives.text({ nullable: true }),
    },
  }),
};

export const frontendVersionedServiceRepoDbConfig = makeDbConfig({
  tables: frontendVersionedServiceRepoTables,
});

export class FrontendVersionedServiceRepoDb extends Context.Service<
  FrontendVersionedServiceRepoDb,
  IDb<IResourceDbConfig<IAnyModels, typeof frontendVersionedServiceRepoTables>>
>()('@zerospin/system-worker/FrontendVersionedServiceRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/FrontendVersionedServiceRepoDb.Tx',
    ITx<
      IResourceDbConfig<IAnyModels, typeof frontendVersionedServiceRepoTables>
    >
  >('@zerospin/system-worker/FrontendVersionedServiceRepoDb.Tx');
}
