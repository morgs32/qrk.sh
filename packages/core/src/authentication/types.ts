import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

export type IAuthenticationSignature<
  VERSION extends string = string,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
  HISTORICAL_DEFINITIONS extends readonly Readonly<{
    version: string;
    schema: Schema.Schema.AnyNoContext;
    adaptSignature: (props: {
      signature: never;
    }) => Effect.Effect<unknown, IAnyError>;
  }>[] = readonly Readonly<{
    version: string;
    schema: Schema.Schema.AnyNoContext;
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
    schemaJsonSchema: unknown;
    historicalDefinitions: readonly {
      version: string;
      schemaJsonSchema: unknown;
    }[];
  };
  decodeAndAdaptSignature: (props: {
    version: string;
    signature: unknown;
  }) => Effect.Effect<Schema.Schema.Type<SIGNATURE_SCHEMA>, IAnyError>;
};
