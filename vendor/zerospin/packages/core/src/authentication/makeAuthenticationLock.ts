import { Schema } from 'effect';

export const AuthenticationLockSchema = Schema.Struct({
  version: Schema.String,
  signatureJsonSchema: Schema.Unknown,
});

export const makeAuthenticationLock = (props: {
  version: string;
  signature: Schema.Codec<unknown, unknown>;
}): Schema.Schema.Type<typeof AuthenticationLockSchema> => ({
  version: props.version,
  signatureJsonSchema: Schema.toJsonSchemaDocument(props.signature),
});
