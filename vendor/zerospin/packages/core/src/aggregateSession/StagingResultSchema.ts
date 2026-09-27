import { Schema } from 'effect';

import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';

import { RefSchema } from './AggregateActorCommandSchema/ResourceSchema/ResourceSchema.ts';

/** Only successful local staging creates a retained command. */
export const StagingResultSchema = Schema.Struct({
  startedAt: Schema.DateFromString,
  completedAt: Schema.DateFromString,
  stagedDelta: Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
    mutations: Schema.Array(EncodedAppliedMutationSchema),
  }),
});
