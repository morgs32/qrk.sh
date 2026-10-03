import { PublicFailureSchema } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

export const BrowserCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  delta: ActorDeltaSchema,
  failure: Schema.NullOr(PublicFailureSchema),
});
export type IBrowserCommand = typeof BrowserCommandSchema.Type;
