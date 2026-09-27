import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAggregateActorVersion } from '../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion';
import { makeServiceActorVersion } from '../serviceActor/make/makeServiceActorVersion';

import { assertSessionClaims } from './assertSessionClaims';
import { makeActorIdentity } from './make/makeActorIdentity/makeActorIdentity';

const schema = Schema.Struct({
  aggregateId: Schema.String,
  subject: Schema.String,
});
const identity = makeActorIdentity({
  claims: schema,
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
  it('derives only selected identity fields and keeps the complete claims schema', () => {
    expect(identity.claimsSchema).toBe(schema);
    expect(Object.keys(identity.identitySchema.fields)).toEqual(['subject']);
    expect(identity.sql.placeholder('subject').name).toBe('subject');
    expect(() =>
      Reflect.apply(identity.sql.placeholder, identity.sql, ['aggregateId']),
    ).toThrow();
  });
  it('uses only actorPath fields to identify a partition', () => {
    const partition = makeActorIdentity({
      claims: Schema.Struct({ subject: Schema.String, role: Schema.String }),
      actorPath: RoutePattern.parse('/:subject'),
    });
    const path = (claims: typeof partition.claimsSchema.Type) =>
      createHref(
        partition.pattern,
        Schema.decodeUnknownSync(partition.identitySchema)(claims),
      );
    expect(path({ subject: 'alice', role: 'reader' })).toBe('/alice');
    expect(path({ subject: 'alice', role: 'admin' })).toBe('/alice');
    expect(path({ subject: 'bob', role: 'reader' })).toBe('/bob');
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
  it('permits only matching direct claims when restoring a session', () => {
    const expected = { aggregateId: 'acct_first', nested: { value: 1 } };
    expect(() =>
      assertSessionClaims(expected, {
        nested: { value: 1 },
        aggregateId: 'acct_first',
      }),
    ).not.toThrow();
    expect(() =>
      assertSessionClaims(expected, {
        ...expected,
        aggregateId: 'acct_other',
      }),
    ).toThrow();
    expect(() => assertSessionClaims(undefined, expected)).not.toThrow();
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
          // @ts-expect-error Callback claims must match the declared claims schema.
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
        // @ts-expect-error Service callback claims must match its declared schema.
        authenticate: () => Effect.succeed({ aggregateId: 'acct_verified' }),
      },
    },
  );
}
