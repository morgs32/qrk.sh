import { Effect, Layer, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAggregate } from './makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeVersion.ts';
import { requireVersion as requireAggregateVersion } from './requireVersion.ts';

const shopper = makeAggregate({ name: 'shopper' });
assert<Equals<typeof shopper.name, 'shopper'>>();

describe('aggregate identity and versions', () => {
  it('shares an identity between independent exact versions', () => {
    const first = makeAggregateVersion(shopper, {
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    const second = makeAggregateVersion(shopper, {
      version: '2.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    assert<Equals<typeof first.name, 'shopper'>>();
    assert<Equals<typeof first.version, '1.0.0'>>();
    expect(shopper).toEqual({ name: 'shopper', layer: Layer.empty });
    expect(first.layer).toBe(shopper.layer);
    expect(second.layer).toBe(shopper.layer);

    expect(first).not.toHaveProperty('upgrade');
    expect(first).not.toHaveProperty('makeCommand');
    expect(first).not.toHaveProperty('getVersion');
    expect(first).not.toHaveProperty('initializeGuards');
    expect(first).not.toHaveProperty('__initializeRequirements');
    expect(first).not.toBe(second);
    expect(first.name).toBe(second.name);
    expect(Effect.runSync(requireAggregateVersion(first, '1.0.0'))).toBe(first);
    expect(() =>
      Effect.runSync(requireAggregateVersion(first, '2.0.0')),
    ).toThrow('not "2.0.0"');
  });

  it('rejects invalid names and the superseded version name prop', () => {
    // @ts-expect-error Identity names must be strings.
    expect(() => makeAggregate({ name: 42 })).toThrow(Schema.SchemaError);
    expect(() =>
      makeAggregateVersion(shopper, {
        // @ts-expect-error The identity supplies the name.
        name: 'other',
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('rejects structural copies without authored upgrade inputs', () => {
    const first = makeAggregateVersion(shopper, {
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    expect(() =>
      Reflect.apply(upgradeAggregateVersion, undefined, [
        { ...first },
        { version: '2.0.0' },
      ]),
    ).toThrow(Schema.SchemaError);
  });
});
