import { Schema } from 'effect';

import type { IModel, InferIdFromAbbreviation } from './types.ts';

export function makeModelIdSchema<MODEL extends IModel>(
  model: MODEL,
): Schema.Schema<InferIdFromAbbreviation<MODEL['abbreviation']>> {
  const { abbreviation } = model;

  return makeAbbreviationIdSchema(abbreviation);
}

export function makeAbbreviationIdSchema<ABBREVIATION extends string>(
  abbreviation: ABBREVIATION,
): Schema.Schema<InferIdFromAbbreviation<ABBREVIATION>> {
  return Schema.declare(
    (input: unknown): input is InferIdFromAbbreviation<ABBREVIATION> => {
      return typeof input === 'string' && input.startsWith(`${abbreviation}_`);
    },
  ).annotations({
    jsonSchema: {
      description: `Expected a unique identifier prefixed with "${abbreviation}_"`,
      examples: [`${abbreviation}_123e4567`],
      pattern: `${abbreviation}_[a-zA-Z0-9-]+`,
      type: 'string',
    },
  });
}
