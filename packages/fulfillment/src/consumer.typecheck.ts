import { makeService } from '@zerospin/core/service/make/makeService';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { primitives } from '@zerospin/schema';
import { Context, Effect, Layer } from 'effect';

import {
  Carrier,
  makeFulfillmentServiceModuleV1,
  makeUserAggregateModuleV1,
} from './server.js';

/** Keep the public multi-version factory example checked by the package build. */
export const fulfillmentExample = makeService({
  name: 'fulfillment',
  module: {
    '1.0.0': makeFulfillmentServiceModuleV1(),
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
          extend: ({ models, payload, fulfillmentId }) =>
            models.fulfillment.update({
              resourceId: fulfillmentId,
              attributes: { warehouseCode: payload.warehouseCode },
            }),
        },
      },
    }),
  },
});

export const fulfillmentTarget = fulfillmentExample.versions['1.0.1'];
export const providedFulfillmentSystem = makeSystem({
  name: 'fulfillment-example',
  aggregates: {},
  services: { fulfillment: fulfillmentExample },
  layer: Layer.succeed(Carrier, () => Effect.succeed('tracking-example')),
});
export const userFulfillmentExample = makeUserAggregateModuleV1({
  source: fulfillmentTarget,
});

export function checkMissingCarrierProvider() {
  // @ts-expect-error The default shipping automation requires Carrier.
  makeSystem({
    name: 'missing-carrier',
    aggregates: {},
    services: { fulfillment: fulfillmentExample },
  });
}

export const warehouseShipOverrideExample = makeFulfillmentServiceModuleV1({
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
      replace: ({ models, payload }) =>
        Effect.map(
          models.fulfillment.update({
            resourceId: payload.fulfillmentId,
            attributes: {
              status: 'packed',
              warehouseCode: payload.warehouseCode,
            },
          }),
          mutation => [mutation],
        ),
    },
  },
  automations: {
    ship: Effect.fn('shipFromAssignedWarehouse')(function* ({
      db,
      on,
      contracts,
    }) {
      const row = db.query.fulfillment
        .findFirst({
          where: { id: { eq: on.payload.fulfillmentId } },
        })
        .sync();
      if (row === undefined) return null;
      return contracts.markShipped({
        fulfillmentId: row.id,
        trackingId: row.warehouseCode,
      });
    }),
  },
});

export const replacementOnlyExample = makeFulfillmentServiceModuleV1({
  contracts: {
    markPacked: {
      version: '1.1.0',
      replace: ({ fulfillmentId, models }) =>
        Effect.map(
          models.fulfillment.update({
            resourceId: fulfillmentId,
            attributes: { status: 'packed' },
          }),
          mutation => [mutation],
        ),
    },
  },
});

/** Declaration failures remain visible to application authors. */
export function checkRejectedWarehouseOptions() {
  makeFulfillmentServiceModuleV1({
    // @ts-expect-error A required text field needs a text default.
    models: {
      fulfillment: {
        version: '1.1.0',
        fields: { warehouseCode: primitives.text() },
        defaults: { warehouseCode: 42 },
      },
    },
    contracts: {
      markPacked: {
        version: '1.1.0',
        payload: { warehouseCode: primitives.text() },
      },
    },
  });
  makeFulfillmentServiceModuleV1({
    // @ts-expect-error Required warehouseCode has no initializer.
    models: {
      fulfillment: {
        version: '1.1.0',
        fields: { warehouseCode: primitives.text() },
        defaults: {},
      },
    },
    contracts: {
      markPacked: {
        version: '1.1.0',
        payload: { warehouseCode: primitives.text() },
      },
    },
  });
  makeFulfillmentServiceModuleV1({
    // @ts-expect-error A program cannot be extended and replaced together.
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
        extend: () => Effect.succeed([]),
        replace: () => Effect.succeed([]),
      },
    },
  });
}

class WarehouseCarrier extends Context.Service<WarehouseCarrier, string>()(
  'WarehouseCarrier',
) {}
const customCarrier = makeService({
  name: 'customCarrier',
  module: {
    '1.0.0': makeFulfillmentServiceModuleV1({
      automations: {
        ship: Effect.fn(function* ({ on, contracts }) {
          const trackingId = yield* WarehouseCarrier;
          return contracts.markShipped({
            fulfillmentId: on.payload.fulfillmentId,
            trackingId,
          });
        }),
      },
    }),
  },
});
export const customCarrierSystem = makeSystem({
  name: 'custom-carrier',
  aggregates: {},
  services: { customCarrier },
  layer: Layer.succeed(WarehouseCarrier, 'tracking'),
});
export function checkMissingCustomCarrier() {
  // @ts-expect-error The replacement handler requires its own provider, not Carrier.
  makeSystem({
    name: 'missing-custom-carrier',
    aggregates: {},
    services: { customCarrier },
  });
}
export const dependencyFreeShipSystem = makeSystem({
  name: 'no-carrier',
  aggregates: {},
  services: {
    fulfillment: makeService({
      name: 'fulfillment',
      module: {
        '1.0.0': makeFulfillmentServiceModuleV1({
          automations: { ship: () => Effect.succeed(null) },
        }),
      },
    }),
  },
});
