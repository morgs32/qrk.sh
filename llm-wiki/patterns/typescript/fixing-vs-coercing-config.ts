import { Schema } from 'effect';

/**
 * Fix schema/IConfig parity with satisfies — do not coerce the codec after construction.
 *
 * @bad `ZerospinConfigSchema as unknown as Schema.Codec<IConfig, unknown>`.
 */
export const ZerospinConfigSchema = Schema.Struct({
  entry: Schema.String,
  authentication: Schema.optional(
    Schema.Struct({
      onIdentityCreated: Schema.optional(Schema.Unknown),
    }),
  ),
}) satisfies Schema.Codec<IConfig, unknown>;

declare type IConfig = {
  entry: string;
  authentication?: { onIdentityCreated?: unknown };
};
