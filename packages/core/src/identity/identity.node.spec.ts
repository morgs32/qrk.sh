import { RoutePattern } from '@remix-run/route-pattern';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAggregateActorVersion } from '../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion';
import { makeServiceActorVersion } from '../serviceActor/make/makeServiceActorVersion';

import { assertSessionIdentity } from './assertSessionIdentity';
import { makeActorIdentity } from './make/makeActorIdentity/makeActorIdentity';

const schema = Schema.Struct({
  aggregateId: Schema.String,
  subject: Schema.String,
});
const identity = makeActorIdentity({
  schema,
  actorPath: RoutePattern.parse('/:subject'),
});
const db = makeActorDbVersion({ models: {} });
const definition = {
  version: '1.0.0',
  identity,
  db,
  queries: {},
  contracts: {},
};

describe('actor identity declarations', () => {
  it('derives only selected identity fields and keeps the complete identity schema', () => {
    expect(identity.identitySchema).toBe(schema);
    expect(Object.keys(identity.actorSchema.fields)).toEqual(['subject']);
    expect(identity.sql.placeholder('subject').name).toBe('subject');
    expect(() =>
      Reflect.apply(identity.sql.placeholder, identity.sql, ['aggregateId']),
    ).toThrow();
  });
  it('requires an explicit policy for both actor kinds', () => {
    const { contracts: _, ...service } = definition;
    for (const authentication of [
      undefined,
      {},
      { credentialsSchema: schema },
    ]) {
      expect(() =>
        Reflect.apply(makeAggregateActorVersion, undefined, [
          { name: 'actor' },
          { ...definition, authentication },
        ]),
      ).toThrow();
      expect(() =>
        Reflect.apply(makeServiceActorVersion, undefined, [
          { name: 'actor' },
          { ...service, authentication },
        ]),
      ).toThrow();
    }
    expect(
      makeAggregateActorVersion(
        { name: 'actor' },
        { ...definition, authentication: 'none' },
      ).authentication,
    ).toBe('none');
    expect(
      makeServiceActorVersion(
        { name: 'actor' },
        { ...service, authentication: 'none' },
      ).authentication,
    ).toBe('none');
  });
  it('permits only matching direct identities when restoring a session', () => {
    const expected = { aggregateId: 'acct_first', nested: { value: 1 } };
    expect(() =>
      assertSessionIdentity(expected, {
        nested: { value: 1 },
        aggregateId: 'acct_first',
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionIdentity(expected, {
        ...expected,
        aggregateId: 'acct_other',
      }),
    ).toThrow();
    expect(() => assertSessionIdentity(undefined, expected)).not.toThrow();
  });
});

// Compile-only checks: credentials infer from their schema; identity comes from the actor declaration.
export function checkActorAuthenticationTypes() {
  const credentialsSchema = Schema.Struct({ token: Schema.String });
  makeAggregateActorVersion(
    { name: 'verified' },
    {
      ...definition,
      authentication: {
        credentialsSchema,
        authenticate: ({ credentials }) =>
          Effect.succeed({
            aggregateId: 'acct_verified',
            subject: credentials.token,
          }),
      },
    },
  );
  makeAggregateActorVersion(
    { name: 'invalid' },
    {
      ...definition,
      authentication: {
        credentialsSchema,
        authenticate: () =>
          // @ts-expect-error Callback identity must match the declared identity schema.
          Effect.succeed({ aggregateId: 'acct_verified', subject: 42 }),
      },
    },
  );
  makeServiceActorVersion(
    { name: 'invalid' },
    {
      version: '1.0.0',
      db,
      identity,
      queries: {},
      authentication: {
        credentialsSchema,
        // @ts-expect-error Service callback identity must match its declared schema.
        authenticate: () => Effect.succeed({ aggregateId: 'acct_verified' }),
      },
    },
  );
}
