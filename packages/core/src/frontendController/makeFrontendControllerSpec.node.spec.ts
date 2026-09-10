import { primitives } from '@zerospin/schema';
import { describe, expect, it } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { models } from '../models/index.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import { makeFrontendControllerSpec } from './makeFrontendControllerSpec.ts';

describe('makeFrontendControllerSpec', () => {
  it('serializes an aggregate frontend controller without frontend SemVer', () => {
    const controller = makeFrontendController({
      aggregateVersion: '1.0.0',
      systemName: 'test-system',
      aggregateName: 'user',
      name: 'web',
      models: {},
      contracts: {},
    });

    const spec = makeFrontendControllerSpec(controller);
    expect(spec).toMatchObject({
      kind: 'aggregate',
      systemName: 'test-system',
      aggregateName: 'user',
      name: 'web',
      aggregateVersion: '1.0.0',
      modelNames: [],
      models: {},
      contracts: {},
      aggregateFrontendLock: { models: {}, contracts: {} },
    });
    expect('version' in spec).toBe(false);
    expect('signature' in spec).toBe(false);
    expect('userIdJsonSchema' in spec).toBe(false);
  });

  it('serializes a service frontend controller through the same spec shape', () => {
    const controller = makeFrontendController({
      systemName: 'test-system',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: {},
    });

    const spec = makeFrontendControllerSpec(controller);
    expect(spec).toMatchObject({
      kind: 'service',
      serviceVersion: '1.0.0',
      systemName: 'test-system',
      serviceName: 'catalog',
      name: 'browse',
      modelNames: [],
      models: {},
      contracts: {},
      serviceFrontendLock: { models: {} },
    });
    expect('version' in spec).toBe(false);
    expect('signature' in spec).toBe(false);
    expect('userIdJsonSchema' in spec).toBe(false);
  });

  it('generates models, contracts, primitive descriptors, and locks', () => {
    const Product = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: { name: primitives.text() },
        indexes: [{ name: 'product_name_idx', columns: ['name'] }],
        version: '1.0.0',
      },
    );
    const renameProduct = contracts.makeVersion(
      contracts.makeCommand('renameProduct'),
      {
        version: '1.0.0',
        payload: { name: primitives.text() },
        models: { product: Product },
      },
    );
    const controller = makeFrontendController({
      aggregateVersion: '1.0.0',
      systemName: 'test-system',
      aggregateName: 'catalog',
      name: 'manage',
      models: { product: Product },
      contracts: { renameProduct: { contract: renameProduct } },
    });

    const spec = makeFrontendControllerSpec(controller);
    const model = spec.models.product;

    expect(model?.properties).toEqual(Product.spec.propertiesShape);
    expect(spec.contracts.renameProduct?.payloadShape).toEqual(
      renameProduct.spec.payloadShape,
    );
    expect(spec.contracts.renameProduct?.models).toEqual({
      product: Product.spec,
    });
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec);
    expect(model?.indexes[0]).not.toBe(Product.indexes[0]);
    expect(model?.indexes[0]?.columns).not.toBe(Product.indexes[0]?.columns);
  });
});
