import { defineContract } from '@zerospin/core/contracts/defineContract';
import {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
import type {
  IAnyMutation,
  IModelMutations,
} from '@zerospin/core/contracts/types';
import type { IActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { Model } from '@zerospin/core/models/defineModel';
import type {
  ActorQuery,
  IActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import { upgradeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeReplica } from '@zerospin/core/models/make/makeReplica';
import type { IAnyModels, IModel } from '@zerospin/core/models/types';
import { ContractError, type IAnyError } from '@zerospin/error';
import { primitives, type ITextDescriptor } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import {
  makeFulfillmentModelV1,
  type makeFulfillmentModelWithWarehouse,
} from './portable.js';
export { makeFulfillmentRequester } from './requestFulfillment.js';

export { Carrier } from './Carrier.js';

const requestPayload = {
  fulfillmentId: primitives.foreignKey({ abbreviation: 'ful' }),
  requestId: primitives.text(),
  aggregateId: primitives.text(),
  userId: primitives.text(),
  purchaseId: primitives.text(),
};
const packingPayload = {
  fulfillmentId: primitives.foreignKey({ abbreviation: 'ful' }),
};
const shippingPayload = {
  fulfillmentId: primitives.foreignKey({ abbreviation: 'ful' }),
  trackingId: primitives.text(),
};

const makeDefaultBundle = (fulfillment = makeFulfillmentModelV1()) => {
  const requestFulfillment = makeContractVersion(
    defineContract('requestFulfillment'),
    {
      version: '1.0.0',
      models: { fulfillment },
      payload: requestPayload,
      program: ({ payload, models }) =>
        Effect.map(
          models.fulfillment.create({
            resourceId: payload.fulfillmentId,
            attributes: {
              requestId: payload.requestId,
              aggregateId: payload.aggregateId,
              userId: payload.userId,
              purchaseId: payload.purchaseId,
              status: 'requested',
              trackingId: null,
            },
          }),
          mutation => [mutation],
        ),
    },
  );
  const markPacked = makeContractVersion(defineContract('markPacked'), {
    version: '1.0.0',
    failures: {
      stale: ContractError.schema({ code: 'fulfillment-state-conflict' }),
    },
    guard: Effect.fn('fulfillment.markPacked.guard')(function* ({
      db,
      payload,
      failures,
    }) {
      const row = db.query.fulfillment
        .findFirst({ where: { id: { eq: payload.fulfillmentId } } })
        .sync();
      if (row?.status !== 'requested') {
        return yield* failures.stale.make({
          message: 'Fulfillment is no longer requested.',
        });
      }
    }),
    models: { fulfillment },
    payload: packingPayload,
    program: ({ payload, models }) =>
      Effect.map(
        models.fulfillment.update({
          resourceId: payload.fulfillmentId,
          attributes: { status: 'packed' },
        }),
        mutation => [mutation],
      ),
  });
  const markShipped = makeContractVersion(defineContract('markShipped'), {
    version: '1.0.0',
    failures: {
      stale: ContractError.schema({ code: 'fulfillment-state-conflict' }),
    },
    guard: Effect.fn('fulfillment.markShipped.guard')(function* ({
      db,
      payload,
      failures,
    }) {
      const row = db.query.fulfillment
        .findFirst({ where: { id: { eq: payload.fulfillmentId } } })
        .sync();
      if (row?.status !== 'packed') {
        return yield* failures.stale.make({
          message: 'Fulfillment is no longer packed.',
        });
      }
    }),
    models: { fulfillment },
    payload: shippingPayload,
    program: ({ payload, models }) =>
      Effect.map(
        models.fulfillment.update({
          resourceId: payload.fulfillmentId,
          attributes: { status: 'shipped', trackingId: payload.trackingId },
        }),
        mutation => [mutation],
      ),
  });
  return {
    models: { fulfillment },
    contracts: { requestFulfillment, markPacked, markShipped },
  };
};

type IWarehouseConstructionOptions = {
  models: {
    fulfillment: {
      version: '1.1.0';
      fields: { warehouseCode: ITextDescriptor<false, undefined> };
      defaults: { warehouseCode: string };
    };
  };
  contracts: {
    markPacked:
      | {
          version: '1.1.0';
          payload: { warehouseCode: ITextDescriptor<false, undefined> };
          extend?: (props: {
            fulfillmentId: `ful_${string}`;
            payload: { fulfillmentId: `ful_${string}`; warehouseCode: string };
            models: {
              fulfillment: IModelMutations<
                ReturnType<typeof makeFulfillmentModelWithWarehouse>
              >;
            };
          }) => Effect.Effect<
            IAnyMutation | readonly IAnyMutation[],
            IAnyError
          >;
          replace?: never;
        }
      | {
          version: '1.1.0';
          payload: { warehouseCode: ITextDescriptor<false, undefined> };
          replace: (props: {
            fulfillmentId: `ful_${string}`;
            payload: { fulfillmentId: `ful_${string}`; warehouseCode: string };
            models: {
              fulfillment: IModelMutations<
                ReturnType<typeof makeFulfillmentModelWithWarehouse>
              >;
            };
          }) => Effect.Effect<readonly IAnyMutation[], IAnyError>;
          extend?: never;
        };
  };
};

const makeWarehouseBundleBase = (options: IWarehouseConstructionOptions) => {
  const base = makeDefaultBundle();
  if (
    options.models.fulfillment.fields.warehouseCode.kind !==
    primitives.text().kind
  ) {
    throw new Error('warehouseCode must be text');
  }
  const warehouseCode = options.models.fulfillment.defaults.warehouseCode;
  if (typeof warehouseCode !== 'string' || warehouseCode.length === 0) {
    throw new Error('warehouseCode requires a nonempty default');
  }
  const fulfillment = upgradeModelVersion(base.models.fulfillment, {
    version: options.models.fulfillment.version,
    attributes: {
      warehouseCode: options.models.fulfillment.fields.warehouseCode,
    },
    indexes: [
      { name: 'fulfillment_request', columns: ['requestId'], unique: true },
      { name: 'fulfillment_user', columns: ['userId'] },
    ],
  });
  const requestFulfillment = upgradeContractVersion(
    base.contracts.requestFulfillment,
    {
      version: '1.1.0',
      models: { fulfillment },
      payload: {},
      up: ({ payload }) => Effect.succeed(payload),
      down: ({ payload }) => Effect.succeed(payload),
      program: ({ payload, models }) =>
        Effect.map(
          models.fulfillment.create({
            resourceId: payload.fulfillmentId,
            attributes: {
              requestId: payload.requestId,
              aggregateId: payload.aggregateId,
              userId: payload.userId,
              purchaseId: payload.purchaseId,
              status: 'requested',
              trackingId: null,
              warehouseCode,
            },
          }),
          mutation => [mutation],
        ),
    },
  );
  const markPacked = upgradeContractVersion(base.contracts.markPacked, {
    guard: base.contracts.markPacked.guard!,
    version: options.contracts.markPacked.version,
    models: { fulfillment },
    payload: options.contracts.markPacked.payload,
    up: ({ payload }) => Effect.succeed({ ...payload, warehouseCode }),
    down: ({ payload }) => {
      const { warehouseCode: _warehouseCode, ...previous } = payload;
      return Effect.succeed(previous);
    },
    program: ({ payload, models }) => {
      const input = { payload, models, fulfillmentId: payload.fulfillmentId };
      if (options.contracts.markPacked.replace !== undefined) {
        return options.contracts.markPacked
          .replace(input)
          .pipe(Effect.map(mutations => [...mutations]));
      }
      return Effect.gen(function* () {
        const normal = yield* models.fulfillment.update({
          resourceId: payload.fulfillmentId,
          attributes: { status: 'packed' },
        });
        const extra =
          options.contracts.markPacked.extend === undefined
            ? []
            : yield* options.contracts.markPacked.extend(input);
        return [normal, ...(Array.isArray(extra) ? extra : [extra])];
      });
    },
  });
  const markShipped = upgradeContractVersion(base.contracts.markShipped, {
    guard: base.contracts.markShipped.guard!,
    version: '1.1.0',
    models: { fulfillment },
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    down: ({ payload }) => Effect.succeed(payload),
    program: ({ payload, models }) =>
      Effect.map(
        models.fulfillment.update({
          resourceId: payload.fulfillmentId,
          attributes: { status: 'shipped', trackingId: payload.trackingId },
        }),
        mutation => [mutation],
      ),
  });
  return {
    models: { fulfillment },
    contracts: { requestFulfillment, markPacked, markShipped },
  };
};

type IDefaultOptions = {
  sourceModel?: ReturnType<typeof makeFulfillmentModelV1>;
};
type IReplacementOptions = {
  contracts: {
    markPacked: {
      version: '1.1.0';
      replace: (props: {
        fulfillmentId: `ful_${string}`;
        payload: { fulfillmentId: `ful_${string}` };
        models: {
          fulfillment: IModelMutations<
            ReturnType<typeof makeFulfillmentModelV1>
          >;
        };
      }) => Effect.Effect<readonly IAnyMutation[], IAnyError>;
    };
  };
};

const makeReplacedDefaultBundleBase = (options: IReplacementOptions) => {
  const base = makeDefaultBundle();
  const markPacked = upgradeContractVersion(base.contracts.markPacked, {
    guard: base.contracts.markPacked.guard!,
    version: options.contracts.markPacked.version,
    models: { fulfillment: base.models.fulfillment },
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    down: ({ payload }) => Effect.succeed(payload),
    program: ({ payload, models }) =>
      options.contracts.markPacked
        .replace({
          payload,
          models,
          fulfillmentId: payload.fulfillmentId,
        })
        .pipe(Effect.map(mutations => [...mutations])),
  });
  return {
    models: base.models,
    contracts: { ...base.contracts, markPacked },
  };
};
const optionsSchema = Schema.Struct({
  sourceModel: Schema.optionalKey(
    Schema.declare(
      (input: unknown): input is ReturnType<typeof makeFulfillmentModelV1> =>
        input instanceof Model &&
        'modelName' in input &&
        'version' in input &&
        input.modelName === 'fulfillment' &&
        input.version === '1.0.0',
    ),
  ),
  models: Schema.optionalKey(
    Schema.Struct({
      fulfillment: Schema.Struct({
        version: Schema.Literal('1.1.0'),
        fields: Schema.Struct({ warehouseCode: Schema.Unknown }),
        defaults: Schema.Struct({ warehouseCode: Schema.String }),
      }),
    }),
  ),
  contracts: Schema.optionalKey(
    Schema.Struct({
      markPacked: Schema.Struct({
        version: Schema.Literal('1.1.0'),
        payload: Schema.optionalKey(
          Schema.Struct({ warehouseCode: Schema.Unknown }),
        ),
        extend: Schema.optionalKey(
          Schema.declare(
            (value: unknown): value is (...args: never[]) => unknown =>
              typeof value === 'function',
          ),
        ),
        replace: Schema.optionalKey(
          Schema.declare(
            (value: unknown): value is (...args: never[]) => unknown =>
              typeof value === 'function',
          ),
        ),
      }),
    }),
  ),
});

export function makeFulfillmentServiceModuleV1(): ReturnType<
  typeof makeDefaultBundle
>;
export function makeFulfillmentServiceModuleV1(
  options: IWarehouseConstructionOptions,
): ReturnType<typeof makeWarehouseBundleBase>;
export function makeFulfillmentServiceModuleV1(
  options: IReplacementOptions,
): ReturnType<typeof makeReplacedDefaultBundleBase>;
export function makeFulfillmentServiceModuleV1(
  options: IDefaultOptions,
): ReturnType<typeof makeDefaultBundle>;
export function makeFulfillmentServiceModuleV1(
  options?:
    | IDefaultOptions
    | IWarehouseConstructionOptions
    | IReplacementOptions,
) {
  Schema.decodeUnknownSync(optionsSchema, { onExcessProperty: 'error' })(
    options ?? {},
  );
  if (options !== undefined && 'contracts' in options) {
    const packed = options.contracts.markPacked;
    if (
      'extend' in packed &&
      packed.extend !== undefined &&
      packed.replace !== undefined
    ) {
      throw new Error('markPacked extend and replace are mutually exclusive');
    }
  }
  if (options !== undefined && 'models' in options) {
    if (!options.contracts?.markPacked.payload) {
      throw new Error(
        'Warehouse customization requires the markPacked warehouse payload',
      );
    }
    return makeWarehouseBundleBase(options);
  }
  if (options !== undefined && 'contracts' in options) {
    if (options.contracts.markPacked.replace === undefined) {
      throw new Error('Packing extension requires warehouse customization');
    }
    return makeReplacedDefaultBundleBase(options);
  }
  return makeDefaultBundle(options?.sourceModel);
}

/** Bind a user-owned replica to one selected fulfillment composition. */
export const makeUserAggregateModuleV1 = <
  const MODEL extends IModel,
  const VERSION extends string,
>(options: {
  source: {
    readonly name: 'fulfillment';
    readonly version: VERSION;
    readonly models: { readonly fulfillment: MODEL };
  };
}) => {
  const fulfillment = makeReplica({
    sourceModel: options.source.models.fulfillment,
    serviceName: options.source.name,
    serviceVersion: options.source.version,
  });
  return {
    models: { fulfillment },
    contracts: {},
  };
};

/** Contribute a user-scoped query against the application's final actor database. */
export const makeUserActorModuleV1 = <
  const MODELS extends IAnyModels,
  const CLAIMS extends IActorIdentity,
  const QUERY extends ActorQuery,
>(options: {
  db: IActorDbVersion<MODELS>;
  claims: CLAIMS;
  selectFulfillment: (db: IActorDbVersion<MODELS>, claims: CLAIMS) => QUERY;
}) => ({
  db: options.db,
  queries: {
    fulfillment: options.selectFulfillment(options.db, options.claims),
  },
  contracts: {},
});

export { FulfillmentClient } from './FulfillmentClient.js';
export { makeFulfillmentModule } from './makeFulfillmentModule.js';
export { makeFulfillmentShippingMachine } from './makeFulfillmentShippingMachine.js';
export { makePaidFulfillmentMachine } from './makePaidFulfillmentMachine.js';
export { makeFulfillmentOperationMachine } from './makeFulfillmentOperationMachine.js';

export { makeFulfillmentGuards } from './makeFulfillmentGuards.js';
