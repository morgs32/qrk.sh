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
import { makeServiceController } from './makeServiceController.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
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

const VersionedProduct = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'vprd',
    modelName: 'versionedProduct',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'vprd',
      modelName: 'versionedProduct',
      attributes: {
        name: primitives.text(),
      },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

const RetiredProduct = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'rprd',
    modelName: 'retiredProduct',
    attributes: {
      name: primitives.text(),
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

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeServiceCommand'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeServiceCommand', () => {
  it.layer(TestLayer)(it => {
    it.effect('builds a service command from service.contracts', () =>
      Effect.gen(function* () {
        const productId = Product.prefixId('product-1');
        const command = yield* makeServiceCommand({
          contracts: appService.contracts,
          serviceName: 'app',
          systemVersion: '1.0.0',
          contractName: 'createProduct',
          payload: {
            id: productId,
            name: 'Basic T-Shirt',
            price: 20,
          },
        });

        expect(command.commandType).toBe('service');
        expect(command.commandName).toBe('createProduct');
        expect(command.serviceName).toBe('app');
        expect(command.systemVersion).toBe('1.0.0');
        expect(command.payload).toEqual({
          id: productId,
          name: 'Basic T-Shirt',
          price: 20,
        });
      }),
    );

    it.effect('service.makeCommand delegates to makeServiceCommand', () =>
      Effect.gen(function* () {
        const productId = Product.prefixId('product-2');
        const command = yield* appService.makeCommand({
          contractName: 'createProduct',
          systemVersion: '1.0.0',
          payload: {
            id: productId,
            name: 'Canvas Backpack',
            price: 50,
          },
        });

        expect(command.commandType).toBe('service');
        expect(command.serviceName).toBe('app');
        expect(command.systemVersion).toBe('1.0.0');
        expect(command.payload.name).toBe('Canvas Backpack');
      }),
    );
  });

  it('accepts one direct service-owned historical-to-current edge', () => {
    const mutationAdapters = {
      versionedProduct: {
        create: [
          {
            source: VersionedProduct.createMutation('1.0.0'),
            destination: VersionedProduct.createMutation('2.0.0'),
            adapter: mutation =>
              Effect.succeed({
                ...mutation,
                modelVersion: '2.0.0',
              }),
          },
        ],
      },
    };

    const service = makeServiceController({
      name: 'app',
      version: '2.0.0',
      models: { versionedProduct: VersionedProduct },
      contracts: {},
      mutationAdapters,
    });

    expect(service.mutationAdapters).toBe(mutationAdapters);
  });

  it('rejects a service adapter chain whose destination is historical', () => {
    expect(() =>
      makeServiceController({
        name: 'app',
        version: '2.0.0',
        models: { versionedProduct: VersionedProduct },
        contracts: {},
        mutationAdapters: {
          versionedProduct: {
            create: [
              {
                source: VersionedProduct.createMutation('1.0.0'),
                destination: VersionedProduct.createMutation('1.0.0'),
                adapter: mutation => Effect.succeed(mutation),
              },
            ],
          },
        },
      }),
    ).toThrow('destination version "1.0.0" is not current version "2.0.0"');
  });

  it('requires all five service operations before a model can be retired', () => {
    expect(() =>
      makeServiceController({
        name: 'app',
        version: '2.0.0',
        models: {},
        contracts: {},
        mutationAdapters: {
          retiredProduct: {
            create: [
              {
                source: RetiredProduct.createMutation('1.0.0'),
                destination: null,
              },
            ],
          },
        },
      }),
    ).toThrow(
      'retired model "retiredProduct" must exhaustively adapt or discard every create/update/delete/move/replicateResource source version',
    );

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '2.0.0',
        models: {},
        contracts: {},
        mutationAdapters: {
          retiredProduct: {
            create: [
              {
                source: RetiredProduct.createMutation('1.0.0'),
                destination: null,
              },
            ],
            update: [
              {
                source: RetiredProduct.updateMutation('1.0.0'),
                destination: null,
              },
            ],
            delete: [
              {
                source: RetiredProduct.deleteMutation('1.0.0'),
                destination: null,
              },
            ],
            move: [
              {
                source: RetiredProduct.moveMutation('1.0.0'),
                destination: null,
              },
            ],
            replicateResource: [
              {
                source: RetiredProduct.replicateResourceMutation('1.0.0'),
                destination: null,
              },
            ],
          },
        },
      }),
    ).not.toThrow();
  });
});
