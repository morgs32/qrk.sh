import { readFileSync } from 'node:fs';

import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../authentication/makeSignature.ts';
import { makeSystem } from '../system/makeSystem.ts';

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
    expect(Product.attributes).toEqual({ name: primitives.text() });
    expect(Object.keys(Product.metadata)).toEqual([
      'id',
      'modelName',
      'createdAt',
      'updatedAt',
      'version',
      'deletedAt',
    ]);
    expect(Product.metadata.deletedAt).toMatchObject({
      kind: 'date',
      nullable: true,
    });
    expect(Product.propertiesShape).toEqual({
      ...Product.metadata,
      ...Product.attributes,
    });
    expect(CartItem.attributes.productId.table).toBe(Product.table);
    expect(Object.getOwnPropertyDescriptor(Product, 'serviceName')).toEqual({
      configurable: false,
      enumerable: true,
      value: 'app',
      writable: false,
    });
  });

  it('makes systems reject plain and wrong-service models from services', () => {
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
      makeSystem({
        name: 'app',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          app: {
            // @ts-expect-error plain models are rejected by the public API
            models: { product: PlainProduct },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(/makeServiceModel with serviceName "app"/);
    expect(() =>
      makeSystem({
        name: 'app',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          app: {
            // @ts-expect-error service ownership must match the service name
            models: { directoryProduct: DirectoryProduct },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(/makeServiceModel with serviceName "app"/);
  });
});
