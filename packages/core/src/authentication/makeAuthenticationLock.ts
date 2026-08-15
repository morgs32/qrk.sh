import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IAuthenticationSignature } from './types.ts';

export const AuthenticationLockSchema = Schema.Struct({
  signature: Schema.Struct({
    version: Schema.String,
    schemaJsonSchema: Schema.Unknown,
  }),
});

export const makeAuthenticationLock = Effect.fn('makeAuthenticationLock')(
  function* (props: {
    signature: IAuthenticationSignature;
  }): Effect.fn.Return<
    Schema.Schema.Type<typeof AuthenticationLockSchema>,
    IAnyError
  > {
    return yield* Schema.validate(AuthenticationLockSchema)(
      {
        signature: {
          version: props.signature.version,
          schemaJsonSchema: props.signature.spec.schemaJsonSchema,
        },
      },
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'authentication-lock-invalid',
        prefix: 'Failed to construct the authentication lock',
      }),
    );
  },
);
