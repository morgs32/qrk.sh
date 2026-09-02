import { Schema } from 'effect';

import type { IEncodedResourceShape } from './types.ts';

export const EncodedResourceSchema: Schema.Codec<
  IEncodedResourceShape,
  unknown
> = Schema.StructWithRest(
  Schema.Struct({
    createdAt: Schema.DateFromString,
    deletedAt: Schema.optional(Schema.NullOr(Schema.DateFromString)),
    id: Schema.String,
    modelName: Schema.String,
    updatedAt: Schema.DateFromString,
    version: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);
