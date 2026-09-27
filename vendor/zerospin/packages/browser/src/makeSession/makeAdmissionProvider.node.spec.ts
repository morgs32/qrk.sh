import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAdmissionProvider } from './makeAdmissionProvider';

const claimsSchema = Schema.Struct({
  aggregateId: Schema.String,
  subject: Schema.String,
});
const credentialsSchema = Schema.Struct({ token: Schema.String });

describe('session admission inputs', () => {
  it('captures direct claims by value for initial admission and reconnect', async () => {
    const claims = { aggregateId: 'acct_first', subject: 'first' };
    const provider = makeAdmissionProvider({
      claimsSchema,
      initialization: { claims },
    });
    claims.aggregateId = 'acct_second';
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      claims: { aggregateId: 'acct_first', subject: 'first' },
    });
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      claims: { aggregateId: 'acct_first', subject: 'first' },
    });
    const next = makeAdmissionProvider({
      claimsSchema,
      initialization: { claims },
    });
    expect(await Effect.runPromise(next.getAdmission())).toMatchObject({
      claims: { aggregateId: 'acct_second' },
    });
  });

  it('gets and validates fresh credentials each time without retaining them as identity', async () => {
    let token = 'first';
    const provider = makeAdmissionProvider({
      claimsSchema,
      credentialsSchema,
      initialization: { getCredentials: () => Effect.succeed({ token }) },
    });
    expect(provider.claims).toBeUndefined();
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      credentials: { token: 'first' },
    });
    token = 'second';
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      credentials: { token: 'second' },
    });
  });

  it('rejects wrong modes, mixed inputs, invalid identities and invalid credentials', async () => {
    const claims = { aggregateId: 'acct_first', subject: 'first' };
    const getCredentials = () => Effect.succeed({ token: 'token' });
    for (const initialization of [
      { claims, getCredentials },
      { getCredentials },
      { claims: { aggregateId: 42 } },
    ]) {
      expect(() =>
        Reflect.apply(makeAdmissionProvider, undefined, [
          { claimsSchema, initialization },
        ]),
      ).toThrow();
    }
    expect(() =>
      makeAdmissionProvider({
        claimsSchema,
        credentialsSchema,
        initialization: { claims },
      }),
    ).toThrow();
    const invalid = makeAdmissionProvider({
      claimsSchema,
      credentialsSchema,
      initialization: { getCredentials: () => Effect.succeed({ token: 42 }) },
    });
    await expect(Effect.runPromise(invalid.getAdmission())).rejects.toThrow();
  });
});
