import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { aggregates } from './index.ts';

describe('aggregate authorization', () => {
  it('allows omission of authorization and preserves supplied checks and failures', async () => {
    const aggregate = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'open' }),
      {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      },
    );
    expect(aggregate.authorize).toBeUndefined();
    const rejection = new ZerospinError({ code: 'denied', message: 'Denied' });
    const authorize = () => Effect.fail(rejection);
    const restricted = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'restricted' }),
      {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
        authorize,
      },
    );
    expect(restricted.authorize).toBe(authorize);
    if (restricted.authorize === undefined) {
      throw new Error('Missing authorizer');
    }
    expect(await Effect.runPromise(Effect.flip(restricted.authorize()))).toBe(
      rejection,
    );
    expect(() =>
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'invalid' }), {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
        // @ts-expect-error Authorization must be a function when supplied.
        authorize: true,
      }),
    ).toThrow(Schema.SchemaError);
  });

  it('adds, inherits, replaces, and removes authorization independently', () => {
    const base = aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'empty' }),
      {
        version: '1.0.0',
        models: {},
        contracts: {},
        selections: {},
      },
    );
    const authorize = () => Effect.void;
    const restricted = aggregates.upgradeVersion(base, {
      version: '2.0.0',
      authorize,
    });
    expect(restricted.authorize).toBe(authorize);
    expect(
      aggregates.upgradeVersion(restricted, { version: '3.0.0' }).authorize,
    ).toBe(authorize);
    const replacement = () => Effect.void;
    expect(
      aggregates.upgradeVersion(restricted, {
        version: '3.0.0',
        authorize: replacement,
      }).authorize,
    ).toBe(replacement);
    const open = aggregates.upgradeVersion(restricted, {
      version: '3.0.0',
      authorize: null,
    });
    expect(open).not.toHaveProperty('authorize');
    expect(
      aggregates.upgradeVersion(open, { version: '4.0.0' }),
    ).not.toHaveProperty('authorize');
    expect(restricted.authorize).toBe(authorize);
    expect(base).not.toHaveProperty('authorize');
  });
});
