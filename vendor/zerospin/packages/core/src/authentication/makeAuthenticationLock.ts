import { Schema } from 'effect';

import type { IAuthenticationSignature } from './types.ts';

export const AuthenticationLockSchema = Schema.Struct({
  signature: Schema.Struct({
    version: Schema.String,
    schemaJsonSchema: Schema.Unknown,
  }),
});

export const makeAuthenticationLock = (props: {
  signature: IAuthenticationSignature;
}): Schema.Schema.Type<typeof AuthenticationLockSchema> => ({
  signature: {
    version: props.signature.version,
    schemaJsonSchema: props.signature.spec.schemaJsonSchema,
  },
});
