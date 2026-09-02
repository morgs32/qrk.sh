import { it } from '@effect/vitest';
import { Effect, Result, Schema } from 'effect';
import { describe, expect } from 'vitest';

import {
  AuthenticationLockSchema,
  makeAuthenticationLock,
} from './makeAuthenticationLock.ts';
import { makeSignature, Signature } from './makeSignature.ts';

describe('makeSignature', () => {
  const signature = makeSignature(
    {
      version: '2.0.0',
      schema: Schema.Struct({ subject: Schema.String, tenant: Schema.String }),
    },
    [
      {
        version: '1.0.0',
        schema: Schema.Struct({ userId: Schema.String }),
        adaptSignature: ({ signature }: { signature: { userId: string } }) =>
          Effect.succeed({ subject: signature.userId, tenant: 'default' }),
      },
    ],
  );

  it('generates Draft 2020-12 documents for current and historical signatures', () => {
    expect(signature.spec.schemaJsonSchema).toMatchObject({
      dialect: 'draft-2020-12',
      definitions: {},
      schema: { type: 'object' },
    });
    expect(
      signature.spec.historicalDefinitions[0]?.schemaJsonSchema,
    ).toMatchObject({
      dialect: 'draft-2020-12',
      definitions: {},
      schema: { type: 'object' },
    });
  });

  it('constructs the current authentication lock synchronously', () => {
    const lock = makeAuthenticationLock({ signature });

    expect(Schema.is(AuthenticationLockSchema)(lock)).toBe(true);
    expect(lock).toEqual({
      signature: {
        version: signature.version,
        schemaJsonSchema: signature.spec.schemaJsonSchema,
      },
    });
  });

  it.effect('decodes current signatures without adaptation', () =>
    Effect.gen(function* () {
      expect(
        yield* signature.decodeAndAdaptSignature({
          version: '2.0.0',
          signature: { subject: 'user-1', tenant: 'tenant-1' },
        }),
      ).toEqual({ subject: 'user-1', tenant: 'tenant-1' });
    }),
  );

  it.effect('adapts a retained historical signature directly to current', () =>
    Effect.gen(function* () {
      expect(
        yield* signature.decodeAndAdaptSignature({
          version: '1.0.0',
          signature: { userId: 'user-1' },
        }),
      ).toEqual({ subject: 'user-1', tenant: 'default' });
    }),
  );

  it.effect('rejects unavailable historical signature versions', () =>
    Effect.gen(function* () {
      const result = yield* signature
        .decodeAndAdaptSignature({ version: '0.1.0', signature: {} })
        .pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.code).toBe(
          'authentication-signature-version-unsupported',
        );
      }
    }),
  );

  it('constructs a canonical Signature and rejects invalid or excess props', () => {
    expect(signature).toBeInstanceOf(Signature);
    expect(() =>
      makeSignature({ version: '1.0.0-dev.1', schema: Schema.Struct({}) }, []),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSignature({ version: '1.0.0', schema: Schema.Struct({}) }, [
        {
          version: '1.0.0',
          schema: Schema.Struct({}),
          adaptSignature: () => Effect.succeed({}),
        },
      ]),
    ).toThrow(Schema.SchemaError);
    expect(() =>
      makeSignature(
        {
          version: '1.0.0',
          schema: Schema.Struct({}),
          extra: true,
        } as never,
        [],
      ),
    ).toThrow(Schema.SchemaError);
  });
});
