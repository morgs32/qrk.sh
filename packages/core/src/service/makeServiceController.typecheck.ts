import { Effect, Schema } from 'effect';

import { makeContract } from '../contracts/makeContract.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeServiceController } from './makeServiceController.ts';

const Product = makeModel(
  {
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

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
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

const createUser = makeContract({
  commandName: 'createUser',
  payload: {
    id: User.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: User.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: User.create('1.0.0', {
        resourceId: payload.id,
        attributes: {
          name: payload.name,
        },
      }),
    }),
  version: '1.0.0',
});

makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  // @ts-expect-error CoreTypeError — service contracts must mutate service models
  contracts: { createUser },
});

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({
        maximumPrice: Schema.Number,
      }),
      query: Effect.fn('getProducts')(function* ({ db, params }) {
        yield* Effect.void;

        const maximumPrice = params.maximumPrice;
        void maximumPrice;

        return db.query.product
          .findMany({
            columns: {
              name: true,
              price: true,
            },
          })
          .sync();
      }),
    },
  },
});

void appService.queries.getProducts.query({
  db: null as never,
  params: {
    maximumPrice: 100,
  },
});

void appService.queries.getProducts.query({
  db: null as never,
  // @ts-expect-error params must match getProducts.paramsSchema
  params: {
    wrong: true,
  },
});

// @ts-expect-error queryName must be on service.queries
void appService.queries.notOnService;

void appService.makeCommand({
  contractName: 'createProduct',
  systemVersion: '1.0.0',
  payload: {
    id: Product.prefixId('p1'),
    name: 'Basic T-Shirt',
    price: 20,
  },
});

void appService.makeCommand({
  systemVersion: '1.0.0',
  // @ts-expect-error contractName must be on service.contracts
  contractName: 'notOnService',
  payload: {},
});

void appService.makeCommand({
  contractName: 'createProduct',
  systemVersion: '1.0.0',
  // @ts-expect-error payload must match createProduct contract
  payload: { wrong: true },
});

const VersionedServiceProduct = makeServiceModel(
  {
    serviceName: 'catalog',
    abbreviation: 'vsprd',
    modelName: 'versionedServiceProduct',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'vsprd',
      modelName: 'versionedServiceProduct',
      attributes: {
        name: primitives.text(),
      },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

makeServiceController({
  name: 'catalog',
  version: '2.0.0',
  models: { versionedServiceProduct: VersionedServiceProduct },
  contracts: {},
  mutationAdapters: {
    versionedServiceProduct: {
      create: [
        {
          source: VersionedServiceProduct.createMutation('1.0.0'),
          destination: VersionedServiceProduct.createMutation('2.0.0'),
          adapter: mutation =>
            Effect.succeed({
              ...mutation,
              modelVersion: '2.0.0',
            }),
        },
      ],
    },
  },
});

makeServiceController({
  name: 'catalog',
  version: '2.0.0',
  models: { versionedServiceProduct: VersionedServiceProduct },
  contracts: {},
  mutationAdapters: {
    versionedServiceProduct: {
      create: [
        {
          source: VersionedServiceProduct.createMutation('1.0.0'),
          destination: VersionedServiceProduct.createMutation('2.0.0'),
          // @ts-expect-error mutation adapters must not require runtime services
          adapter: mutation =>
            VersionedServiceProduct.makeId().pipe(
              Effect.map(() => ({
                ...mutation,
                modelVersion: '2.0.0',
              })),
            ),
        },
      ],
    },
  },
});
