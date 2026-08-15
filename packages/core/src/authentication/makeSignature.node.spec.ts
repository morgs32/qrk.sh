import { it } from '@effect/vitest';
import { Effect, Either, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeSignature } from './makeSignature.ts';

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
        adaptSignature: ({ signature }) =>
          Effect.succeed({ subject: signature.userId, tenant: 'default' }),
      },
    ],
  );

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
        .pipe(Effect.either);
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left.code).toBe(
          'authentication-signature-version-unsupported',
        );
      }
    }),
  );

  it('rejects prerelease and duplicate versions during construction', () => {
    expect(() =>
      makeSignature({ version: '1.0.0-dev.1', schema: Schema.Struct({}) }, []),
    ).toThrow('stable SemVer');
    expect(() =>
      makeSignature({ version: '1.0.0', schema: Schema.Struct({}) }, [
        {
          version: '1.0.0',
          schema: Schema.Struct({}),
          adaptSignature: () => Effect.succeed({}),
        },
      ]),
    ).toThrow('duplicate signature version');
  });
});
