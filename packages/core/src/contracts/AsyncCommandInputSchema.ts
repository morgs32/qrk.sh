import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

/** Immutable backend-only input. Null external evidence is a complete observation. */
export const AsyncCommandInputSchema = Schema.Struct({
  sourceCommandId: makeAbbreviationIdSchema('cmd'),
  external: Schema.Json,
});
export type IAsyncCommandInput = typeof AsyncCommandInputSchema.Type;
