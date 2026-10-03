/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { Schema } from 'effect';

import { RefSchema } from '../aggregateSession/AggregateActorCommandSchema/ResourceSchema/ResourceSchema.ts';
import type { IActorDelta } from '../aggregateSession/types.ts';

import { EncodedResourceSchema } from './EncodedResourceSchema.ts';
export const ActorDeltaSchema: Schema.Codec<IActorDelta, any> = Schema.Struct({
  upserted: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(RefSchema),
});
