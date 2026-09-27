import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAdmissionProvider } from './makeAdmissionProvider';

const identitySchema = Schema.Struct({
  aggregateId: Schema.String,
  subject: Schema.String,
});
const credentialsSchema = Schema.Struct({ token: Schema.String });

describe('session admission inputs', () => {
  it('captures direct identity by value for initial admission and reconnect', async () => {
    const identity = { aggregateId: 'acct_first', subject: 'first' };
    const provider = makeAdmissionProvider({
      identitySchema,
      initialization: { identity },
    });
    identity.aggregateId = 'acct_second';
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      identity: { aggregateId: 'acct_first', subject: 'first' },
    });
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      identity: { aggregateId: 'acct_first', subject: 'first' },
    });
    const next = makeAdmissionProvider({
      identitySchema,
      initialization: { identity },
    });
    expect(await Effect.runPromise(next.getAdmission())).toMatchObject({
      identity: { aggregateId: 'acct_second' },
    });
  });

  it('gets and validates fresh credentials each time without retaining them as identity', async () => {
    let token = 'first';
    const provider = makeAdmissionProvider({
      identitySchema,
      credentialsSchema,
      initialization: { getCredentials: () => Effect.succeed({ token }) },
    });
    expect(provider.identity).toBeUndefined();
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      credentials: { token: 'first' },
    });
    token = 'second';
    expect(await Effect.runPromise(provider.getAdmission())).toEqual({
      credentials: { token: 'second' },
    });
  });

  it('rejects wrong modes, mixed inputs, invalid identities and invalid credentials', async () => {
    const identity = { aggregateId: 'acct_first', subject: 'first' };
    const getCredentials = () => Effect.succeed({ token: 'token' });
    for (const initialization of [
      { identity, getCredentials },
      { getCredentials },
      { identity: { aggregateId: 42 } },
    ]) {
      expect(() =>
        Reflect.apply(makeAdmissionProvider, undefined, [
          { identitySchema, initialization },
        ]),
      ).toThrow();
    }
    expect(() =>
      makeAdmissionProvider({
        identitySchema,
        credentialsSchema,
        initialization: { identity },
      }),
    ).toThrow();
    const invalid = makeAdmissionProvider({
      identitySchema,
      credentialsSchema,
      initialization: { getCredentials: () => Effect.succeed({ token: 42 }) },
    });
    await expect(Effect.runPromise(invalid.getAdmission())).rejects.toThrow();
  });
});
