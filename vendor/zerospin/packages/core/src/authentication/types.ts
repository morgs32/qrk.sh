import type { IAnyError } from '@zerospin/error';
import type { Effect, JsonSchema, Schema } from 'effect';

export type IAuthentication<
  VERSION extends string = string,
  SIGNATURE extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  USER_ID extends string = string,
> = Readonly<{
  version: VERSION;
  signature: SIGNATURE;
  authenticate(props: {
    signature: Schema.Schema.Type<SIGNATURE>;
  }): Effect.Effect<USER_ID, IAnyError>;
  spec: Readonly<{
    version: VERSION;
    signatureJsonSchema: Readonly<{
      dialect: 'draft-2020-12';
      schema: Readonly<JsonSchema.JsonSchema>;
      definitions: Readonly<Record<string, Readonly<JsonSchema.JsonSchema>>>;
    }>;
  }>;
}>;
