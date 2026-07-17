import { Schema } from 'effect/Schema';

/**
 * Fix schema/IConfig parity with satisfies — do not cast schema as unknown as Schema<IConfig>.
 *
 * @bad `ZerospinConfigSchema as unknown as Schema.Schema<IConfig, unknown>`.
 */
export const ZerospinConfigSchema = Schema.Struct({
  entry: Schema.String,
  authentication: Schema.optional(
    Schema.Struct({
      onIdentityCreated: Schema.optional(Schema.Unknown),
    }),
  ),
}) satisfies Schema.Schema<IConfig, unknown>;

declare type IConfig = {
  entry: string;
  authentication?: { onIdentityCreated?: unknown };
};

declare namespace Schema {
  type Schema<A, I> = unknown;
}
