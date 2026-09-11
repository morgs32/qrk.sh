import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { makeModel, makeModelVersion } from '../models/makeModel.ts';
import { prefixId } from '../models/prefixId.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeServiceCommand } from './makeServiceCommand.ts';

const ProductModel = makeModel({ name: 'product', abbreviation: 'prd' });

const Product = makeModelVersion(ProductModel, {
  attributes: {
    name: primitives.text(),
    price: primitives.number(),
  },
  indexes: [],
  version: '1.0.0',
});

const createProduct = makeContractVersion(defineCommand('createProduct'), {
  payload: {
    id: primitives.foreignKey({ abbreviation: ProductModel.abbreviation }),
    name: primitives.text(),
    price: primitives.number(),
  },
  version: '1.0.0',
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeServiceCommand'),
  ErrorLayer,
  TraceLoggerLayer,
);

describe('makeServiceCommand', () => {
  it.layer(TestLayer)(it => {
    it.effect('builds a service command from a named contract', () =>
      Effect.gen(function* () {
        const productId = prefixId(Product, 'product-1');
        const command = yield* makeServiceCommand({
          contracts: { createProduct },
          serviceName: 'catalog',
          serviceVersion: '2.0.0',
          contractName: 'createProduct',
          payload: {
            id: productId,
            name: 'Basic T-Shirt',
            price: 20,
          },
        });

        expect(command).toMatchObject({
          commandName: 'createProduct',
          serviceName: 'catalog',
          serviceVersion: '2.0.0',
          payload: {
            id: productId,
            name: 'Basic T-Shirt',
            price: 20,
          },
        });
        expect(command).not.toHaveProperty('commandType');
      }),
    );

    it.effect('fails when the named contract is absent at runtime', () =>
      Effect.gen(function* () {
        const contracts = { createProduct };
        Reflect.deleteProperty(contracts, 'createProduct');
        const exit = yield* makeServiceCommand({
          contracts,
          serviceName: 'catalog',
          serviceVersion: '2.0.0',
          contractName: 'createProduct',
          payload: {
            id: prefixId(Product, 'product-2'),
            name: 'Canvas Backpack',
            price: 50,
          },
        }).pipe(Effect.exit);

        expect(exit._tag).toBe('Failure');
      }),
    );
  });
});
