import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeModel, makeModelVersion } from './makeModel.ts';
import { prefixId } from './prefixId.ts';

const Product = makeModelVersion(
  makeModel({ name: 'product', abbreviation: 'prod' }),
  { version: '1.0.0', attributes: {}, indexes: [] },
);

describe('models.prefixId', () => {
  it('prefixes explicit suffixes synchronously', () => {
    for (const suffix of ['seed-12', '', 'usr_seed-12', 'seed_prod_12']) {
      const id = prefixId(Product, suffix);
      assert<Equals<typeof id, `prod_${string}`>>();
      expect(id).toBe(`prod_${suffix}`);
    }
  });

  it('rejects suffixes already starting with the model prefix', () => {
    for (const suffix of ['prod_seed-12', 'prod_', 'prod_prod_seed-12']) {
      expect(() => prefixId(Product, suffix)).toThrow(
        new Error('ID suffix already starts with "prod_"'),
      );
    }
  });
});
