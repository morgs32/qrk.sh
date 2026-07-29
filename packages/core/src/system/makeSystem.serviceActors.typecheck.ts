import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';
import { makeServiceActorController } from '../serviceActorController/makeServiceActorController.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';

import { makeSystem } from './makeSystem.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({}),
});

const shopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    catalog: {
      frontendController: catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

const app = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  actorControllers: { shopper },
});

const shopping = makeSystem({
  accountControllers: {},
  serviceControllers: { app },
  name: 'shopping',
  version: '2.0.0',
});

const systemName: 'shopping' = shopping.name;
const serviceName: 'app' = shopping.serviceControllers.app.name;
const actorName: 'shopper' =
  shopping.serviceControllers.app.actorControllers.shopper.name;
const frontendName: 'catalog' =
  shopping.serviceControllers.app.actorControllers.shopper.frontends.catalog
    .name;
void systemName;
void serviceName;
void actorName;
void frontendName;
assert<Equals<keyof typeof shopping.serviceControllers, 'app'>>();

const wrongSystemCatalog = makeServiceFrontendController({
  systemName: 'other',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({}),
});

const wrongSystemShopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    catalog: {
      frontendController: wrongSystemCatalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

const wrongSystemApp = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  actorControllers: { shopper: wrongSystemShopper },
});

makeSystem({
  accountControllers: {},
  serviceControllers: {
    // @ts-expect-error — nested service frontend systemName must equal system name
    app: wrongSystemApp,
  },
  name: 'shopping',
  version: '1.0.0',
});
