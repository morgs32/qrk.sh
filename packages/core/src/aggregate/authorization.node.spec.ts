import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAggregate } from './makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from './makeVersion.ts';

describe('aggregate authorization', () => {
  it('allows omission of authorization and preserves supplied checks and failures', async () => {
    const aggregate = makeAggregateVersion(makeAggregate({ name: 'open' }), {
      authentication: authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    expect(aggregate.authorize).toBeUndefined();
    const rejection = new ZerospinError({ code: 'denied', message: 'Denied' });
    const authorize = () => Effect.fail(rejection);
    const restricted = makeAggregateVersion(
      makeAggregate({ name: 'restricted' }),
      {
        authentication: authenticationFixtureOwner.authentication,
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
    expect(await Effect.runPromise(Effect.flip(authorize()))).toBe(rejection);
    expect(() =>
      makeAggregateVersion(makeAggregate({ name: 'invalid' }), {
        authentication: authenticationFixtureOwner.authentication,
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
    const base = makeAggregateVersion(makeAggregate({ name: 'empty' }), {
      authentication: authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: {},
      contracts: {},
      selections: {},
    });
    const authorize = () => Effect.void;
    const restricted = upgradeAggregateVersion(base, {
      version: '2.0.0',
      authorize,
    });
    expect(restricted.authorize).toBe(authorize);
    expect(
      upgradeAggregateVersion(restricted, { version: '3.0.0' }).authorize,
    ).toBe(authorize);
    const replacement = () => Effect.void;
    expect(
      upgradeAggregateVersion(restricted, {
        version: '3.0.0',
        authorize: replacement,
      }).authorize,
    ).toBe(replacement);
    const open = upgradeAggregateVersion(restricted, {
      version: '3.0.0',
      authorize: null,
    });
    expect(open).not.toHaveProperty('authorize');
    expect(
      upgradeAggregateVersion(open, { version: '4.0.0' }),
    ).not.toHaveProperty('authorize');
    expect(restricted.authorize).toBe(authorize);
    expect(base).not.toHaveProperty('authorize');
  });
});
