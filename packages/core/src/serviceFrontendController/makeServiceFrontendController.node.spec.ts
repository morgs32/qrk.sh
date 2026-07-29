import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeModel } from '../models/makeModel.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeServiceFrontendController } from './makeServiceFrontendController.ts';
import { makeServiceFrontendControllerSpec } from './makeServiceFrontendControllerSpec.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'prd',
      modelName: 'product',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

const OtherServiceProduct = makeServiceModel(
  {
    serviceName: 'other',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
  [],
);

const AccountProduct = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '2.0.0',
  },
  [],
);

describe('makeServiceFrontendController', () => {
  it('returns the complete client-safe controller', () => {
    const models = { product: Product };
    const signature = Schema.Struct({ subject: Schema.String });

    const frontend = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '3.0.0',
      models,
      signature,
    });

    expect(frontend).toStrictEqual({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '3.0.0',
      models,
      modelNames: ['product'],
      signature,
    });
    expect(frontend).not.toHaveProperty('contracts');
    expect(frontend).not.toHaveProperty('queries');
    expect(frontend).not.toHaveProperty('makeUnstagedCommand');
  });

  it('accepts an explicit empty models registry', () => {
    const frontend = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'identity',
      version: '1.0.0',
      models: {},
      signature: Schema.Struct({ subject: Schema.String }),
    });

    expect(frontend.models).toStrictEqual({});
    expect(frontend.modelNames).toStrictEqual([]);
  });

  it('rejects a missing version before model validation', () => {
    const props = {
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '1.0.0',
      models: {},
      signature: Schema.Struct({}),
    };
    Reflect.deleteProperty(props, 'version');

    expect(() => makeServiceFrontendController(props)).toThrow(
      'makeServiceFrontendController: version must be a non-empty string',
    );
  });

  it('rejects an empty version before model validation', () => {
    const props = {
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '1.0.0',
      models: {},
      signature: Schema.Struct({}),
    };
    Reflect.set(props, 'version', '');

    expect(() => makeServiceFrontendController(props)).toThrow(
      'makeServiceFrontendController: version must be a non-empty string',
    );
  });

  it('rejects a registry key that differs from modelName', () => {
    const models = { product: Product };
    Reflect.deleteProperty(models, 'product');
    Reflect.set(models, 'wrong', Product);

    expect(() =>
      makeServiceFrontendController({
        systemName: 'shopping',
        serviceName: 'app',
        actorName: 'shopper',
        frontendName: 'catalog',
        version: '1.0.0',
        models,
        signature: Schema.Struct({}),
      }),
    ).toThrow(
      'makeServiceFrontendController: models key "wrong" must equal model.modelName "product"',
    );
  });

  it('rejects a model owned by another service', () => {
    const models = { product: Product };
    Reflect.set(models, 'product', OtherServiceProduct);

    expect(() =>
      makeServiceFrontendController({
        systemName: 'shopping',
        serviceName: 'app',
        actorName: 'shopper',
        frontendName: 'catalog',
        version: '1.0.0',
        models,
        signature: Schema.Struct({}),
      }),
    ).toThrow(
      'makeServiceFrontendController: models.product must be created by makeServiceModel with serviceName "app"',
    );
  });

  it('rejects an account-owned model', () => {
    const models = { product: Product };
    Reflect.set(models, 'product', AccountProduct);

    expect(() =>
      makeServiceFrontendController({
        systemName: 'shopping',
        serviceName: 'app',
        actorName: 'shopper',
        frontendName: 'catalog',
        version: '1.0.0',
        models,
        signature: Schema.Struct({}),
      }),
    ).toThrow(
      'makeServiceFrontendController: models.product must be created by makeServiceModel with serviceName "app"',
    );
  });
});

describe('makeServiceFrontendControllerSpec', () => {
  it('encodes complete model definitions and the signature schema', () => {
    const frontend = makeServiceFrontendController({
      systemName: 'shopping',
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '3.0.0',
      models: { product: Product },
      signature: Schema.Struct({ subject: Schema.String }),
    });

    const spec = makeServiceFrontendControllerSpec(frontend);

    expect(spec).toMatchObject({
      serviceName: 'app',
      actorName: 'shopper',
      frontendName: 'catalog',
      version: '3.0.0',
      models: {
        product: {
          modelName: 'product',
          abbreviation: 'prd',
          version: '2.0.0',
          historicalDefinitions: [
            {
              modelName: 'product',
              abbreviation: 'prd',
              version: '1.0.0',
            },
          ],
        },
      },
      signatureJsonSchema: {
        type: 'object',
        required: ['subject'],
      },
    });
    expect(spec.models.product.properties).toHaveProperty('id');
    expect(spec.models.product.properties).toHaveProperty('name');
    expect(spec).not.toHaveProperty('systemName');
    expect(spec).not.toHaveProperty('modelNames');
    expect(spec).not.toHaveProperty('authenticate');
  });
});
