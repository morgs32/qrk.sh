import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { Schema } from 'effect';

import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import { AdmissionResultSchema } from './AdmissionResultSchema.ts';
import { ExecutionResultSchema } from './ExecutionResultSchema.ts';

export const BrowserCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  delta: ActorDeltaSchema,
  admission: Schema.NullOr(AdmissionResultSchema),
  execution: Schema.NullOr(ExecutionResultSchema),
});
export type IBrowserCommand = typeof BrowserCommandSchema.Type;
