import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceFrontendController } from '../serviceFrontendController/makeServiceFrontendController.ts';

import { makeServiceActorController } from './makeServiceActorController.ts';

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

const authenticate = () => Effect.succeed('actr_shopper');

const catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

describe('makeServiceActorController', () => {
  it('resolves a read-only frontend binding without adding surfaces', () => {
    const actor = makeServiceActorController({
      name: 'shopper',
      version: '2.0.0',
      models: { credential: Credential, product: Product },
      frontends: {
        catalog: {
          frontendController: catalog,
          authenticate,
        },
      },
    });

    expect(actor.name).toBe('shopper');
    expect(actor.version).toBe('2.0.0');
    expect(actor.frontends.catalog).toStrictEqual({
      name: 'catalog',
      frontendController: catalog,
      models: catalog.models,
      authenticate,
    });
    expect(actor.frontends.catalog).not.toHaveProperty('contracts');
    expect(actor.frontends.catalog).not.toHaveProperty('queries');
    expect(actor.frontends.catalog).not.toHaveProperty('makeCommand');
  });

  it('accepts empty actor models and frontends', () => {
    const actor = makeServiceActorController({
      name: 'identity',
      version: '1.0.0',
      models: {},
      frontends: {},
    });

    expect(actor.models).toStrictEqual({});
    expect(actor.frontends).toStrictEqual({});
  });

  it('rejects a missing version before model validation', () => {
    const props = {
      name: 'shopper',
      version: '1.0.0',
      models: {},
      frontends: {},
    };
    Reflect.deleteProperty(props, 'version');

    expect(() => makeServiceActorController(props)).toThrow(
      'makeServiceActorController: version must be a non-empty string',
    );
  });

  it('rejects an empty version before model validation', () => {
    const props = {
      name: 'shopper',
      version: '1.0.0',
      models: {},
      frontends: {},
    };
    Reflect.set(props, 'version', '');

    expect(() => makeServiceActorController(props)).toThrow(
      'makeServiceActorController: version must be a non-empty string',
    );
  });

  it('rejects a frontend registry key that differs from frontendName', () => {
    const frontends = {
      catalog: {
        frontendController: catalog,
        authenticate,
      },
    };
    const catalogBinding = frontends.catalog;
    Reflect.deleteProperty(frontends, 'catalog');
    Reflect.set(frontends, 'wrong', catalogBinding);

    expect(() =>
      makeServiceActorController({
        name: 'shopper',
        version: '1.0.0',
        models: { product: Product },
        frontends,
      }),
    ).toThrow(
      'makeServiceActorController: frontends.wrong must bind a frontendController with frontendName "wrong", received "catalog"',
    );
  });

  it('rejects a frontend owned by another actor', () => {
    const frontendController = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '1.0.0',
      models: { product: Product },
      signature: Schema.Struct({ subject: Schema.String }),
    });
    Reflect.set(frontendController, 'actorName', 'otherActor');

    expect(() =>
      makeServiceActorController({
        name: 'shopper',
        version: '1.0.0',
        models: { product: Product },
        frontends: {
          catalog: { frontendController, authenticate },
        },
      }),
    ).toThrow(
      'makeServiceActorController: frontends.catalog.frontendController must have actorName "shopper", received "otherActor"',
    );
  });

  it('rejects a frontend model missing from actor models', () => {
    const actorModels = { product: Product };
    Reflect.deleteProperty(actorModels, 'product');

    expect(() =>
      makeServiceActorController({
        name: 'shopper',
        version: '1.0.0',
        models: actorModels,
        frontends: {
          catalog: {
            frontendController: catalog,
            authenticate,
          },
        },
      }),
    ).toThrow(
      'makeServiceActorController: frontends.catalog.models.product must be the same object as actor models.product',
    );
  });

  it('rejects a structurally identical duplicate frontend model object', () => {
    const frontendModels = { product: Product };
    const frontendController = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '1.0.0',
      models: frontendModels,
      signature: Schema.Struct({}),
    });
    Reflect.set(frontendModels, 'product', DuplicateProduct);

    expect(() =>
      makeServiceActorController({
        name: 'shopper',
        version: '1.0.0',
        models: { product: Product },
        frontends: {
          catalog: { frontendController, authenticate },
        },
      }),
    ).toThrow(
      'makeServiceActorController: frontends.catalog.models.product must be the same object as actor models.product',
    );
  });
});
