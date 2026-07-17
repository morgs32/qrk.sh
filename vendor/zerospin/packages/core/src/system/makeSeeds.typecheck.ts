import { Effect, Schema } from 'effect';

import { makeContract } from '../contracts/makeContract.ts';
import { List, User, userAccount } from '../fixtures/system.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';

import { makeSeeds } from './makeSeeds.ts';
import { makeSystem } from './makeSystem.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
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

const seedSystem = makeSystem({
  accountControllers: {
    user: userAccount,
  },
  serviceControllers: {
    app: appService,
  },
  name: 'system-worker',
  version: '1.0.1',
});

const accountSeed = userAccount.makeCommand({
  accountId: 'account-1',
  systemName: seedSystem.name,
  systemVersion: seedSystem.version,
  contractName: 'createList',
  payload: {
    id: List.prefixId('typecheck-list'),
    name: 'Typecheck list',
    userId: User.prefixId('typecheck-user'),
  },
});

const serviceSeed = appService.makeCommand({
  contractName: 'createProduct',
  systemVersion: seedSystem.version,
  payload: {
    id: Product.prefixId('typecheck-product'),
    name: 'Typecheck product',
  },
});

// Both maps are required, but either map can select no controller groups.
void makeSeeds({
  system: seedSystem,
  accounts: {
    user: [accountSeed],
  },
  services: {},
});

void makeSeeds({
  system: seedSystem,
  accounts: {},
  services: {
    app: [serviceSeed],
  },
});

void makeSeeds({
  system: seedSystem,
  accounts: {
    // @ts-expect-error account group keys must exist on system.accountControllers
    admin: [accountSeed],
  },
  services: {},
});

void makeSeeds({
  system: seedSystem,
  accounts: {},
  services: {
    // @ts-expect-error service group keys must exist on system.serviceControllers
    catalog: [serviceSeed],
  },
});

void makeSeeds({
  system: seedSystem,
  accounts: {
    // @ts-expect-error service command Effects cannot be placed in account groups
    user: [serviceSeed],
  },
  services: {},
});

void makeSeeds({
  system: seedSystem,
  accounts: {},
  services: {
    // @ts-expect-error account command Effects cannot be placed in service groups
    app: [accountSeed],
  },
});
