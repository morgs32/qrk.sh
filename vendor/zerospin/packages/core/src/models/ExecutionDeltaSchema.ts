/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { Schema } from 'effect';

import { EncodedResourceSchema } from './EncodedResourceSchema.ts';
import type { IExecutionDelta } from './types.ts';

const EncodedDeletedResourceSchema = Schema.StructWithRest(
  Schema.Struct({
    createdAt: Schema.DateFromString,
    deletedAt: Schema.DateFromString,
    id: Schema.String,
    modelName: Schema.String,
    updatedAt: Schema.DateFromString,
    version: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export const ExecutionDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema),
  updated: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(EncodedDeletedResourceSchema),
}) satisfies Schema.Codec<IExecutionDelta, any>;

export const EmptyExecutionDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  updated: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  deleted: Schema.Array(EncodedDeletedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
});
