import { readFileSync } from 'node:fs';

import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { Model } from './makeModel.ts';
import { makeReplica } from './makeReplica.ts';

import { models } from './index.ts';

describe('makeReplica', () => {
  it('does not import the server-only marker', () => {
    const source = readFileSync(
      new URL('./makeReplica.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('@zerospin/server-only');
  });

  it('creates a client-safe replica with immutable source and service ownership', () => {
    const Product = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
    );
    const replicaProps = {
      sourceModel: Product,
      modelVersion: Product.version,
      serviceName: 'app',
    };
    const ProductReplica = makeReplica(replicaProps);
    const CartItem = models.makeVersion(
      models.makeModel({ name: 'cartItem', abbreviation: 'cit' }),
      {
        attributes: {
          productId: primitives.ref({
            table: Product.table,
            relation: 'product',
            inverse: 'cartItems',
          }),
        },
        indexes: [],
        version: '1.0.0',
      },
    );

    expect(ProductReplica.sourceModel).toBe(Product);
    expect(ProductReplica).toBeInstanceOf(Model);
    expect(Model.isReplica(ProductReplica)).toBe(true);
    expect(Model.isReplica(Product)).toBe(false);
    expect(ProductReplica.serviceName).toBe('app');
    replicaProps.serviceName = 'mutated';
    expect(ProductReplica.serviceName).toBe('app');
    expect(() =>
      makeReplica({
        sourceModel: ProductReplica,
        modelVersion: ProductReplica.version,
        serviceName: 'app',
      }),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeReplica({
        sourceModel: ProductReplica,
        modelVersion: ProductReplica.version,
        serviceName: 'app',
      }),
    ).toThrow(/sourceModel must be an authored model/);
    expect(() =>
      makeReplica({
        sourceModel: Product,
        modelVersion: Product.version,
        serviceName: 'app',
        extra: true,
      } as {
        sourceModel: typeof Product;
        serviceName: string;
        modelVersion: typeof Product.version;
      }),
    ).toThrow(Schema.SchemaError);
    expect(ProductReplica.attributes).not.toBe(Product.attributes);
    expect(ProductReplica.attributes).toEqual(Product.attributes);
    expect(Object.keys(ProductReplica.propertiesShape)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
      'name',
      'deletedAt',
      'serviceIndex',
    ]);
    expect(ProductReplica.propertiesShape.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });
    expect(CartItem.attributes.productId.table).toBe(Product.table);
    expect(
      Object.getOwnPropertyDescriptor(ProductReplica, 'sourceModel'),
    ).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(ProductReplica, 'serviceName'),
    ).toBeUndefined();
    expect(
      Object.getOwnPropertyDescriptor(Model.prototype, 'sourceModel'),
    ).toMatchObject({
      configurable: true,
      enumerable: false,
      get: expect.any(Function),
    });
    expect(
      Object.getOwnPropertyDescriptor(Model.prototype, 'serviceName'),
    ).toMatchObject({
      configurable: true,
      enumerable: false,
      get: expect.any(Function),
    });
    expect('sourceModel' in Product).toBe(true);
    expect(Reflect.get(Product, 'sourceModel')).toBeUndefined();
    expect(Object.keys(ProductReplica)).not.toContain('sourceModel');
    expect(Object.keys(ProductReplica)).not.toContain('serviceName');
    expect({ ...ProductReplica }).not.toHaveProperty('sourceModel');
    expect({ ...ProductReplica }).not.toHaveProperty('serviceName');
    expect(JSON.stringify(Object.create(ProductReplica))).toBe('{}');
    expect(Reflect.set(ProductReplica, 'sourceModel', CartItem)).toBe(false);
    expect(Reflect.set(ProductReplica, 'serviceName', 'other')).toBe(false);
    expect(ProductReplica.sourceModel).toBe(Product);
    expect(ProductReplica.serviceName).toBe('app');

    expect(() =>
      Model.markReplica(ProductReplica, {
        sourceModel: CartItem,
        serviceName: 'other',
      }),
    ).toThrow('Model is already marked as a replica');
  });

  it('preserves deletion and source position when encoding the selected version', async () => {
    const Product = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: {
          description: primitives.text(),
          name: primitives.text(),
        },
        indexes: [],
        version: '2.0.0',
      },
    );
    const ProductReplica = makeReplica({
      sourceModel: Product,
      modelVersion: Product.version,
      serviceName: 'catalog',
    });
    const deletedAt = new Date('2026-08-30T01:00:00.000Z');

    const adapted = await Effect.runPromise(
      ProductReplica.adaptResource({
        version: '2.0.0',
        resource: {
          id: 'prd_historical_replica',
          modelName: 'product',
          createdAt: new Date('2026-08-29T01:00:00.000Z'),
          updatedAt: deletedAt,
          version: '2.0.0',
          description: 'Current-only description',
          name: 'Historical product',
          deletedAt,
          serviceIndex: 42,
        },
      }),
    );

    expect(adapted).toEqual({
      id: 'prd_historical_replica',
      modelName: 'product',
      createdAt: '2026-08-29T01:00:00.000Z',
      updatedAt: deletedAt.toISOString(),
      version: '2.0.0',
      name: 'Historical product',
      description: 'Current-only description',
      deletedAt: deletedAt.toISOString(),
      serviceIndex: 42,
    });
    expect(ProductReplica.sourceModel).toBe(Product);
    expect(ProductReplica.serviceName).toBe('catalog');

    expect(() =>
      makeReplica({
        sourceModel: Product,
        // @ts-expect-error the runtime boundary also rejects unavailable versions
        modelVersion: '9.0.0',
        serviceName: 'catalog',
      }),
    ).toThrow(/model-version-unsupported/);
  });
});
