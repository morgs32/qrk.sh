import { Effect, Schema, SchemaTransformation } from 'effect';

/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import type { ISystemConfig } from './types.ts';

export const ZerospinConfigSchema = Schema.Struct({
  $schema: Schema.optionalKey(Schema.String),
  entry: Schema.String,
  seeds: Schema.Struct({
    dev: Schema.NullOr(Schema.String),
    production: Schema.NullOr(Schema.String).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed(null)),
    ),
  }),
}).pipe(
  Schema.decodeTo(
    Schema.Struct({
      entry: Schema.String,
      seeds: Schema.Struct({
        dev: Schema.NullOr(Schema.String),
        production: Schema.NullOr(Schema.String),
      }),
    }),
    SchemaTransformation.transform({
      decode: config => ({
        entry: config.entry,
        seeds: config.seeds,
      }),
      encode: config => ({
        entry: config.entry,
        seeds: config.seeds,
      }),
    }),
  ),
) satisfies Schema.Codec<ISystemConfig, any>;

const _check1: typeof ZerospinConfigSchema.Type = {} as ISystemConfig;
const _check2: ISystemConfig = {} as typeof ZerospinConfigSchema.Type;
void _check1;
void _check2;
