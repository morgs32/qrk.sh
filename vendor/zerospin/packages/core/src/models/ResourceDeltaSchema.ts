/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';

import { EncodedResourceSchema } from './EncodedResourceSchema.ts';
import type { IResourceDelta } from './types.ts';

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

export const ResourceDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema),
  updated: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(EncodedDeletedResourceSchema),
  mutations: Schema.Array(EncodedAppliedMutationSchema),
}) satisfies Schema.Codec<IResourceDelta, any>;

export const EmptyResourceDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  updated: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  deleted: Schema.Array(EncodedDeletedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  mutations: Schema.Array(EncodedAppliedMutationSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
});
