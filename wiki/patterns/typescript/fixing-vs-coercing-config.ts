import { Schema } from 'effect';

/**
 * Fix schema/IConfig parity with satisfies — do not coerce the codec after construction.
 *
 * @bad `ProjectConfigSchema as unknown as Schema.Codec<IConfig, unknown>`.
 */
export const ProjectConfigSchema = Schema.Struct({
  name: Schema.String,
}) satisfies Schema.Codec<IConfig, unknown>;

declare type IConfig = {
  name: string;
};
