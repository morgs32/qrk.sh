import { makeFulfillmentServiceModuleV1 } from '@zerospin/fulfillment/server';
import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { fulfillmentSource } from './fulfillmentSource';
const fulfillment = makeFulfillmentServiceModuleV1({
  sourceModel: fulfillmentSource.models.fulfillment,
});
export const fulfillmentService = sdk.makeService({
  name: 'fulfillment',
  module: {
    '1.0.0': {
      models: fulfillment.models,
      contracts: fulfillment.contracts,
      automations: {},
    },
  },
  queries: {
    '1.0.0': {
      byRequest: {
        paramsSchema: Schema.Struct({ requestId: Schema.String }),
        query: Effect.fn(function* ({
          db,
          params,
        }: {
          db: Pick<
            sdk.IDb<
              sdk.IResourceDbConfig<
                typeof fulfillment.models,
                Record<never, never>
              >
            >,
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
});
