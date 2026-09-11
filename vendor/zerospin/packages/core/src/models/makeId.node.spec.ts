import { CuidFactory } from '@zerospin/schema';
import { Effect } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it, vi } from 'vitest';

import { makeId } from './makeId.ts';
import { makeModel, makeModelVersion } from './makeModel.ts';

const Product = makeModelVersion(
  makeModel({ name: 'product', abbreviation: 'prod' }),
  { version: '1.0.0', attributes: {}, indexes: [] },
);

describe('models.makeId', () => {
  it('generates the suffix lazily when omitted', () => {
    const factory = vi.fn(() => Effect.succeed('generated'));
    const pending = makeId(Product);
    expect(factory).not.toHaveBeenCalled();
    const id = Effect.runSync(
      pending.pipe(Effect.provideService(CuidFactory, factory)),
    );
    assert<Equals<typeof id, `prod_${string}`>>();
    expect(id).toBe('prod_generated');
    expect(factory).toHaveBeenCalledOnce();
  });

  it('propagates a factory defect', () => {
    expect(() =>
      Effect.runSync(
        makeId(Product).pipe(
          Effect.provideService(CuidFactory, () => Effect.die('factory-broke')),
        ),
      ),
    ).toThrow('factory-broke');
  });
});
