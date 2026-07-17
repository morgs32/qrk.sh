import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makeServiceController } from '../service/makeServiceController.ts';

import { makeModel } from './makeModel.ts';
import { makeServiceModel } from './makeServiceModel.ts';
import { primitives } from './primitives.ts';

describe('makeServiceModel', () => {
  it('does not import the server-only marker', () => {
    const source = readFileSync(
      new URL('./makeServiceModel.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('@zerospin/server-only');
  });

  it('creates a client-safe model with immutable service ownership', () => {
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
    const CartItem = makeModel(
      {
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
      },
      [],
    );

    expect(Product.serviceName).toBe('app');
    expect(CartItem.attributes.productId.table).toBe(Product.table);
    expect(Object.getOwnPropertyDescriptor(Product, 'serviceName')).toEqual({
      configurable: false,
      enumerable: true,
      value: 'app',
      writable: false,
    });
  });

  it('makes service controllers reject plain and wrong-service models', () => {
    const PlainProduct = makeModel(
      {
        abbreviation: 'prd',
        modelName: 'product',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const DirectoryProduct = makeServiceModel(
      {
        serviceName: 'directory',
        abbreviation: 'dprd',
        modelName: 'directoryProduct',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );

    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        // @ts-expect-error plain models are rejected by the public API
        models: { product: PlainProduct },
        contracts: {},
      }),
    ).toThrow(/makeServiceModel with serviceName "app"/);
    expect(() =>
      makeServiceController({
        name: 'app',
        version: '1.0.0',
        // @ts-expect-error service ownership must match the controller name
        models: { directoryProduct: DirectoryProduct },
        contracts: {},
      }),
    ).toThrow(/makeServiceModel with serviceName "app"/);
  });
});
