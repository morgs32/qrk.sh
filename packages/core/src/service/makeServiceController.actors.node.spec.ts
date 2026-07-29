import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeServiceActorController } from '../serviceActorController/makeServiceActorController.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeServiceController } from './makeServiceController.ts';

const Credential = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'cred',
    modelName: 'credential',
    attributes: { subject: primitives.text() },
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
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const DuplicateProduct = makeServiceModel(
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
  signature: Schema.Struct({ subject: Schema.String }),
});

const shopper = makeServiceActorController({
  name: 'shopper',
  version: '1.0.0',
  models: { credential: Credential, product: Product },
  frontends: {
    catalog: {
      frontendController: catalog,
      authenticate: () => Effect.succeed('actr_shopper'),
    },
  },
});

describe('makeServiceController actorControllers', () => {
  it('defaults an omitted actor registry to an always-present empty object', () => {
    const service = makeServiceController({
      name: 'app',
      version: '1.0.0',
      models: {},
      contracts: {},
    });

    expect(service.actorControllers).toStrictEqual({});
  });

  it('retains the complete service actor and frontend graph', () => {
    const service = makeServiceController({
      name: 'app',
      version: '1.0.0',
      models: { credential: Credential, product: Product },
      contracts: {},
      actorControllers: { shopper },
    });

    expect(service.actorControllers.shopper).toBe(shopper);
    expect(
      service.actorControllers.shopper.frontends.catalog.frontendController,
    ).toBe(catalog);
  });

  it('rejects an actor registry key that differs from actor name', () => {
    const actorControllers = { shopper };
    Reflect.deleteProperty(actorControllers, 'shopper');
    Reflect.set(actorControllers, 'wrong', shopper);

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        models: { credential: Credential, product: Product },
        contracts: {},
        actorControllers,
      }),
    ).toThrow(
      'makeServiceController: actorControllers.wrong must have name "wrong", received "shopper"',
    );
  });

  it('rejects an actor model missing from service models', () => {
    const models = { credential: Credential, product: Product };
    Reflect.deleteProperty(models, 'credential');

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        models,
        contracts: {},
        actorControllers: { shopper },
      }),
    ).toThrow(
      'makeServiceController: actorControllers.shopper.models.credential must be the same object as service models.credential',
    );
  });

  it('rejects a structurally identical duplicate actor model object', () => {
    const models = { credential: Credential, product: Product };
    Reflect.set(models, 'product', DuplicateProduct);

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        models,
        contracts: {},
        actorControllers: { shopper },
      }),
    ).toThrow(
      'makeServiceController: actorControllers.shopper.models.product must be the same object as service models.product',
    );
  });

  it('rejects a bound frontend owned by another service', () => {
    const frontendController = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '1.0.0',
      models: { product: Product },
      signature: Schema.Struct({}),
    });
    const actorController = makeServiceActorController({
      name: 'shopper',
      version: '1.0.0',
      models: { product: Product },
      frontends: {
        catalog: {
          frontendController,
          authenticate: () => Effect.succeed('actr_shopper'),
        },
      },
    });
    Reflect.set(frontendController, 'serviceName', 'other');

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        models: { product: Product },
        contracts: {},
        actorControllers: { shopper: actorController },
      }),
    ).toThrow(
      'makeServiceController: actorControllers.shopper.frontends.catalog.frontendController must have serviceName "app", received "other"',
    );
  });
});
