import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import { makeService } from '@zerospin/core/service/make/makeService';
import { makeFulfillmentServiceModuleV1 } from '@zerospin/fulfillment/server';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
const manual = makeFulfillmentServiceModuleV1();
export const fulfillmentService = makeService({
  name: 'fulfillment',
  queries: {
    '1.0.0': {
      byRequest: {
        paramsSchema: Schema.Struct({ requestId: Schema.String }),
        query: Effect.fn(function* ({
          db,
          params,
        }: {
          db: Pick<
            IDb<IResourceDbConfig<typeof manual.models, Record<never, never>>>,
            'query'
          >;
          params: { requestId: string };
        }) {
          return (
            db.query.fulfillment
              .findFirst({ where: { requestId: { eq: params.requestId } } })
              .sync() ?? null
          );
        }),
      },
    },
  },
  module: {
    '1.0.0': {
      models: manual.models,
      contracts: manual.contracts,
      automations: {},
    },
    '1.0.1': makeFulfillmentServiceModuleV1({
      models: {
        fulfillment: {
          version: '1.1.0',
          fields: { warehouseCode: primitives.text() },
          defaults: { warehouseCode: 'aus-01' },
        },
      },
      contracts: {
        markPacked: {
          version: '1.1.0',
          payload: { warehouseCode: primitives.text() },
        },
      },
    }),
  },
});
