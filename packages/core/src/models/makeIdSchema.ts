import {
  makeAbbreviationIdSchema,
  type InferIdFromAbbreviation,
} from '@zerospin/schema';
import type { Schema } from 'effect';

import type { IModel } from './types.ts';

export function makeModelIdSchema<MODEL extends IModel>(
  model: MODEL,
): Schema.Codec<
  InferIdFromAbbreviation<MODEL['abbreviation']>,
  InferIdFromAbbreviation<MODEL['abbreviation']>
> {
  const { abbreviation } = model;

  return makeAbbreviationIdSchema(abbreviation);
}
