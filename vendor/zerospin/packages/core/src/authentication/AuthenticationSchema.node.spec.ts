import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { Effect, Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeAggregate } from '../aggregate/makeAggregate.ts';
import { makeAggregateVersion } from '../aggregate/makeVersion.ts';

import { AuthenticationSchema } from './AuthenticationSchema.ts';

const descriptor = {
  signatureSchema: Schema.Struct({ user: Schema.String }),
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.String,
    user: Schema.String,
    role: Schema.String,
  }),
  selectionSchema: Schema.Struct({ user: Schema.String }),
  pattern: RoutePattern.parse('/users/:user'),
};

describe('owner authentication declarations', () => {
  it('validates authoring without invoking authentication', () => {
    const authenticate = vi.fn(() =>
      Effect.succeed({ aggregateId: 'acct_one', user: 'one', role: 'admin' }),
    );
    const aggregate = makeAggregateVersion(makeAggregate({ name: 'test' }), {
      version: '1.0.0',
      authentication: { ...descriptor, authenticate },
      models: {},
      contracts: {},
      selections: {},
    });
    expect(aggregate.authentication.authenticationSchema).toBe(
      descriptor.authenticationSchema,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it.each([
    '/users/(:user)',
    '/users/*user',
    '/:user/:user',
    '/prefix:user',
    '/:user.json',
    'https://example.com/:user',
    '/:user?q=1',
    '/:other',
    '/static',
  ])('rejects unsupported or mismatched route %s', source => {
    expect(() =>
      Schema.decodeUnknownSync(AuthenticationSchema)({
        ...descriptor,
        pattern: RoutePattern.parse(source),
      }),
    ).toThrow();
  });

  it.each([
    Schema.Struct({ user: Schema.Number }),
    Schema.Struct({ user: Schema.optionalKey(Schema.String) }),
    Schema.Struct({ user: Schema.NullOr(Schema.String) }),
    Schema.Struct({ user: Schema.Struct({ value: Schema.String }) }),
    Schema.Struct({ missing: Schema.String }),
    Schema.Struct({ user: Schema.Literal('restricted') }),
  ])('rejects an invalid selection schema', selectionSchema => {
    expect(() =>
      Schema.decodeUnknownSync(AuthenticationSchema)({
        ...descriptor,
        selectionSchema,
      }),
    ).toThrow();
  });

  it('accepts static partitions and branded required strings', () => {
    expect(
      Schema.is(AuthenticationSchema)({
        ...descriptor,
        selectionSchema: Schema.Struct({}),
        pattern: RoutePattern.parse('/all'),
      }),
    ).toBe(true);
    expect(
      Schema.is(AuthenticationSchema)({
        ...descriptor,
        authenticationSchema: Schema.Struct({
          user: Schema.Literals(['one', 'two']),
        }),
        selectionSchema: Schema.Struct({
          user: Schema.Literals(['one', 'two', 'three']),
        }),
      }),
    ).toBe(true);
    const user = Schema.String.pipe(Schema.brand('User'));
    expect(
      Schema.is(AuthenticationSchema)({
        ...descriptor,
        authenticationSchema: Schema.Struct({ user }),
        selectionSchema: Schema.Struct({ user }),
      }),
    ).toBe(true);
  });

  it.each(['a/b', 'a?b#c', 'a%b', '雪☃', 'a\\b', 'a b'])(
    'round-trips encoded selection %s through the library',
    user => {
      const path = createHref(descriptor.pattern, { user });
      const match = createMatcher(descriptor.pattern).match(
        new URL(path, 'https://selection.invalid'),
      );
      expect(match?.params).toEqual({ user });
      expect(
        createHref(descriptor.pattern, match?.params ?? { user: 'missing' }),
      ).toBe(path);
    },
  );

  it('rejects empty parameters and exposes URL normalization for canonical checking', () => {
    expect(() => createHref(descriptor.pattern, { user: '' })).toThrow();
    const path = createHref(descriptor.pattern, { user: '..' });
    expect(
      createMatcher(descriptor.pattern).match(
        new URL(path, 'https://selection.invalid'),
      ),
    ).toBeNull();
    expect(
      createMatcher(descriptor.pattern).match(
        'https://selection.invalid/unrelated',
      ),
    ).toBeNull();
  });
});
