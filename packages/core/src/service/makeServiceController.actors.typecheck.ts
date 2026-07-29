import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceActorController } from '../serviceActorController/makeServiceActorController.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';

import { makeServiceController } from './makeServiceController.ts';

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

const ProductV2 = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
  [],
);

const OtherProduct = makeServiceModel(
  {
    serviceName: 'other',
    abbreviation: 'oprd',
    modelName: 'otherProduct',
    attributes: {},
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

const actorName: 'shopper' = app.actorControllers.shopper.name;
const frontendName: 'catalog' =
  app.actorControllers.shopper.frontends.catalog.name;
void actorName;
void frontendName;
assert<Equals<keyof typeof app.actorControllers, 'shopper'>>();

const noActors = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: {},
  contracts: {},
});
assert<Equals<keyof typeof noActors.actorControllers, never>>();

makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  actorControllers: {
    // @ts-expect-error — actor registry key must equal actor name
    wrong: shopper,
  },
});

const productV2Catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: ProductV2 },
  signature: Schema.Struct({}),
});

const productV2Shopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: ProductV2 },
  frontends: {
    catalog: {
      frontendController: productV2Catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  actorControllers: {
    // @ts-expect-error CoreTypeError — actor model must exactly match service model
    shopper: productV2Shopper,
  },
});

const otherFrontend = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'other',
  actorName: 'shopper',
  frontendName: 'other',
  version: '1.0.0',
  models: { otherProduct: OtherProduct },
  signature: Schema.Struct({}),
});

const otherActor = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { otherProduct: OtherProduct },
  frontends: {
    other: {
      frontendController: otherFrontend,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: {},
  actorControllers: {
    // @ts-expect-error — frontend and actor models belong to the owning service
    shopper: otherActor,
  },
});
