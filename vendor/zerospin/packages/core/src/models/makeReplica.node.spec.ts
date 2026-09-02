import { readFileSync } from 'node:fs';

import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeModel } from './makeModel.ts';
import { makeReplica } from './makeReplica.ts';

describe('makeReplica', () => {
  it('does not import the server-only marker', () => {
    const source = readFileSync(
      new URL('./makeReplica.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('@zerospin/server-only');
  });

  it('creates a client-safe replica with immutable source and service ownership', () => {
    const Product = makeModel({
      abbreviation: 'prd',
      modelName: 'product',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
    });
    const ProductReplica = makeReplica({
      sourceModel: Product,
      serviceName: 'app',
    });
    const CartItem = makeModel({
      abbreviation: 'cit',
      modelName: 'cartItem',
      attributes: {
        productId: primitives.ref({
          table: Product.table,
          relation: 'product',
          inverse: 'cartItems',
        }),
      },
      indexes: [],
      version: '1.0.0',
    });

    expect(ProductReplica.sourceModel).toBe(Product);
    expect(ProductReplica.serviceName).toBe('app');
    expect(ProductReplica.attributes).toBe(Product.attributes);
    expect(Object.keys(ProductReplica.propertiesShape)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
      'name',
      'deletedAt',
    ]);
    expect(ProductReplica.propertiesShape.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });
    expect(CartItem.attributes.productId.table).toBe(Product.table);
    expect(
      Object.getOwnPropertyDescriptor(ProductReplica, 'sourceModel'),
    ).toEqual({
      configurable: false,
      enumerable: true,
      value: Product,
      writable: false,
    });
    expect(
      Object.getOwnPropertyDescriptor(ProductReplica, 'serviceName'),
    ).toEqual({
      configurable: false,
      enumerable: true,
      value: 'app',
      writable: false,
    });
  });

  it('preserves deletion state while adapting every historical definition', async () => {
    const Product = makeModel(
      {
        abbreviation: 'prd',
        modelName: 'product',
        attributes: {
          description: primitives.text(),
          name: primitives.text(),
        },
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
          adaptResource: ({ resource }) =>
            Effect.succeed({
              id: resource.id,
              modelName: resource.modelName,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt,
              version: '1.0.0',
              name: resource.name,
            }),
        },
      ],
    );
    const ProductReplica = makeReplica({
      sourceModel: Product,
      serviceName: 'catalog',
    });
    const deletedAt = new Date('2026-08-30T01:00:00.000Z');

    expect(ProductReplica.historicalDefinitions).toHaveLength(1);
    const historicalDefinition = ProductReplica.historicalDefinitions[0];
    if (historicalDefinition === undefined) {
      throw new Error('expected historical replica definition');
    }
    expect(Object.keys(historicalDefinition.propertiesShape)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
      'name',
      'deletedAt',
    ]);
    expect(historicalDefinition.propertiesShape.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });

    const adapted = await Effect.runPromise(
      ProductReplica.adaptResource({
        version: '1.0.0',
        resource: {
          id: 'prd_historical_replica',
          modelName: 'product',
          createdAt: new Date('2026-08-29T01:00:00.000Z'),
          updatedAt: deletedAt,
          version: '2.0.0',
          description: 'Current-only description',
          name: 'Historical product',
          deletedAt,
        },
      }),
    );

    expect(adapted).toEqual({
      id: 'prd_historical_replica',
      modelName: 'product',
      createdAt: '2026-08-29T01:00:00.000Z',
      updatedAt: deletedAt.toISOString(),
      version: '1.0.0',
      name: 'Historical product',
      deletedAt: deletedAt.toISOString(),
    });
    expect(ProductReplica.sourceModel).toBe(Product);
    expect(ProductReplica.serviceName).toBe('catalog');
  });
});
