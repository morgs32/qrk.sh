import type { IAnyError } from '@zerospin/error';
import type { Effect, JsonSchema, Schema } from 'effect';

export type IAuthenticationSignature<
  VERSION extends string = string,
  SIGNATURE_SCHEMA extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  HISTORICAL_DEFINITIONS extends readonly Readonly<{
    version: string;
    schema: Schema.Codec<unknown, unknown>;
    adaptSignature: (props: {
      signature: never;
    }) => Effect.Effect<unknown, IAnyError>;
  }>[] = readonly Readonly<{
    version: string;
    schema: Schema.Codec<unknown, unknown>;
    adaptSignature: (props: {
      signature: never;
    }) => Effect.Effect<unknown, IAnyError>;
  }>[],
> = {
  version: VERSION;
  schema: SIGNATURE_SCHEMA;
  historicalDefinitions: HISTORICAL_DEFINITIONS;
  spec: {
    version: VERSION;
    schemaJsonSchema: JsonSchema.Document<'draft-2020-12'>;
    historicalDefinitions: readonly {
      version: string;
      schemaJsonSchema: JsonSchema.Document<'draft-2020-12'>;
    }[];
  };
  decodeAndAdaptSignature: (props: {
    version: string;
    signature: unknown;
  }) => Effect.Effect<Schema.Schema.Type<SIGNATURE_SCHEMA>, IAnyError>;
};
