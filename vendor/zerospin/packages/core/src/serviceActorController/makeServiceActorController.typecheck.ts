import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type { IActorId } from '../models/types.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';

import { makeServiceActorController } from './makeServiceActorController.ts';

const Credential = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'cred',
    modelName: 'credential',
    attributes: {
      subject: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

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

const ProductV2 = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
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
  signature: Schema.Struct({ subject: Schema.String }),
});

const otherActorCatalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'otherActor',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

const productV2Catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: ProductV2 },
  signature: Schema.Struct({ subject: Schema.String }),
});

const shopper = makeServiceActorController({
  name: 'shopper',
  version: '2.0.0',
  models: { credential: Credential, product: Product },
  frontends: {
    catalog: {
      frontendController: catalog,
      authenticate: ({ signature, db }) => {
        const subject: string = signature.subject;
        void subject;
        void db.query.credential.findMany().sync();
        // @ts-expect-error — authentication receives query only
        void db.insert;

        return Product.makeId().pipe(
          Effect.map((): IActorId => 'actr_shopper'),
        );
      },
    },
  },
});

const actorName: 'shopper' = shopper.name;
const actorVersion: '2.0.0' = shopper.version;
const bindingName: 'catalog' = shopper.frontends.catalog.name;
void actorName;
void actorVersion;
void bindingName;
assert<Equals<keyof typeof shopper.models, 'credential' | 'product'>>();
assert<Equals<keyof typeof shopper.frontends, 'catalog'>>();
assert<
  Equals<
    Effect.Effect.Context<
      ReturnType<typeof shopper.frontends.catalog.authenticate>
    >,
    CuidFactory
  >
>();

// @ts-expect-error — version is required at the factory call site
makeServiceActorController({
  name: 'shopper',
  models: { product: Product },
  frontends: {},
});

makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    wrong: {
      // @ts-expect-error — binding key must equal frontendName
      frontendController: catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    catalog: {
      // @ts-expect-error — frontend actorName must equal its owner
      frontendController: otherActorCatalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { product: Product },
  frontends: {
    catalog: {
      // @ts-expect-error CoreTypeError — projected model must exactly match actor model
      frontendController: productV2Catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: {},
  frontends: {
    catalog: {
      // @ts-expect-error CoreTypeError — every projected model is actor-readable
      frontendController: catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});
