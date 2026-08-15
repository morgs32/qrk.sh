import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeServiceCommand } from './makeServiceCommand.ts';

const Product = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
      price: primitives.number(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createProduct = makeContract({
  commandName: 'createProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
    name: primitives.text(),
    price: primitives.number(),
  },
  mutations: Schema.Struct({
    created: Product.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Product.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          price: payload.price,
        },
      }),
    }),
  version: '1.0.0',
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeServiceCommand'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeServiceCommand', () => {
  it.layer(TestLayer)(it => {
    it.effect('builds a service command from a named contract', () =>
      Effect.gen(function* () {
        const productId = Product.prefixId('product-1');
        const command = yield* makeServiceCommand({
          contracts: { createProduct },
          serviceName: 'catalog',
          contractName: 'createProduct',
          payload: {
            id: productId,
            name: 'Basic T-Shirt',
            price: 20,
          },
        });

        expect(command).toMatchObject({
          commandType: 'service',
          commandName: 'createProduct',
          serviceName: 'catalog',
          payload: {
            id: productId,
            name: 'Basic T-Shirt',
            price: 20,
          },
        });
      }),
    );

    it.effect('fails when the named contract is absent at runtime', () =>
      Effect.gen(function* () {
        const contracts = { createProduct };
        Reflect.deleteProperty(contracts, 'createProduct');
        const exit = yield* makeServiceCommand({
          contracts,
          serviceName: 'catalog',
          contractName: 'createProduct',
          payload: {
            id: Product.prefixId('product-2'),
            name: 'Canvas Backpack',
            price: 50,
          },
        }).pipe(Effect.exit);

        expect(exit._tag).toBe('Failure');
      }),
    );
  });
});
