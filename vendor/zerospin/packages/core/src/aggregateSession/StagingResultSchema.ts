import { Schema } from 'effect';

import { EncodedAppliedOperationSchema } from '../contracts/encodeAppliedOperation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';

import { RefSchema } from './AggregateActorCommandSchema/ResourceSchema/ResourceSchema.ts';

/** Only successful local staging creates a retained command. */
export const StagingResultSchema = Schema.Struct({
  result: Schema.Json,
  startedAt: Schema.DateFromString,
  completedAt: Schema.DateFromString,
  stagedDelta: Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
    operations: Schema.Array(EncodedAppliedOperationSchema),
  }),
});
