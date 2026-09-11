import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeModelMutations } from '../contracts/makeModelMutations.ts';

import {
  makeModel,
  makeModelVersion,
  upgradeModelVersion,
} from './makeModel.ts';
import { prefixId } from './prefixId.ts';

const CartItem = makeModel({ name: 'cartItem', abbreviation: 'cit' });
const V1 = makeModelVersion(CartItem, {
  attributes: { product: primitives.text() },
  indexes: [{ name: 'by-product', columns: ['product'] }],
  version: '1.0.0',
});
const V2 = upgradeModelVersion(V1, {
  attributes: { amount: primitives.integer() },
  version: '2.0.0',
});
const V3 = upgradeModelVersion(V2, {
  attributes: { amount: null, quantity: primitives.integer() },
  version: '3.0.0',
});

assert<Equals<keyof typeof V3.attributes, 'product' | 'quantity'>>();
assert<Equals<typeof V3.version, '3.0.0'>>();
assert<Equals<typeof V3.modelName, 'cartItem'>>();
assert<Equals<typeof V3.abbreviation, 'cit'>>();

describe('model upgrades', () => {
  it('keeps the model identity independent of its versions', () => {
    assert<Equals<typeof CartItem.name, 'cartItem'>>();
    assert<Equals<typeof CartItem.abbreviation, 'cit'>>();
    expect(CartItem).toEqual({ name: 'cartItem', abbreviation: 'cit' });

    expect(V1.modelName).toBe(CartItem.name);
    expect(V3.abbreviation).toBe(CartItem.abbreviation);
    expect(V1).not.toHaveProperty('upgrade');
    expect(() =>
      makeModel({
        name: 'cartItem',
        abbreviation: 'cit',
        // @ts-expect-error Model identity has no version-specific fields.
        version: '1.0.0',
      }),
    ).toThrow();
  });
  it('inherits, adds and removes attributes without changing earlier versions', async () => {
    expect(Object.keys(V1.attributes)).toEqual(['product']);
    expect(Object.keys(V2.attributes)).toEqual(['product', 'amount']);
    expect(Object.keys(V3.attributes)).toEqual(['product', 'quantity']);
    expect(V3.table.shape).not.toHaveProperty('amount');
    expect(V3.propertiesShape).not.toHaveProperty('amount');
    expect(V3.spec.attributes).toEqual(['product', 'quantity']);
    expect(V3.indexes).toEqual(V1.indexes);

    const mutation = await Effect.runPromise(
      makeModelMutations(V3).create({
        resourceId: prefixId(V3, 'test'),
        attributes: { product: 'apple', quantity: 2 },
      }),
    );
    expect(mutation.modelVersion).toBe('3.0.0');
    expect(() =>
      Schema.decodeUnknownSync(V3.attributesSchema)({
        product: 'apple',
        amount: 2,
      }),
    ).toThrow();
  });

  it('replaces descriptors and allows explicit index replacement', () => {
    const next = upgradeModelVersion(V1, {
      attributes: { product: primitives.integer() },
      indexes: [],
      version: '2.0.0',
    });
    assert<
      Equals<
        Schema.Schema.Type<typeof next.attributesSchema>,
        { readonly product: number }
      >
    >();
    expect(
      Schema.decodeUnknownSync(next.attributesSchema)({ product: 2 }),
    ).toEqual({ product: 2 });
    expect(next.indexes).toEqual([]);
    expect(() =>
      Schema.decodeUnknownSync(next.attributesSchema)({ product: 'apple' }),
    ).toThrow();
  });

  it('rejects unknown removals and dangling inherited indexes', () => {
    expect(() =>
      upgradeModelVersion(V1, {
        // @ts-expect-error Unknown attributes cannot be removed.
        attributes: { missing: null },
        version: '2.0.0',
      }),
    ).toThrow('Cannot remove unknown attribute');
    expect(() =>
      upgradeModelVersion(V1, {
        attributes: { product: null },
        version: '2.0.0',
      }),
    ).toThrow('references missing attribute');
    expect(
      upgradeModelVersion(V1, {
        attributes: { product: null },
        indexes: [],
        version: '2.0.0',
      }).attributes,
    ).toEqual({});
  });

  it('rejects invalid versions and reserved attributes', () => {
    expect(() =>
      upgradeModelVersion(V1, { attributes: {}, version: 'invalid' }),
    ).toThrow();
    expect(() =>
      upgradeModelVersion(V1, {
        // @ts-expect-error Framework attributes are reserved.
        attributes: { id: primitives.text() },
        version: '2.0.0',
      }),
    ).toThrow();
  });
});
