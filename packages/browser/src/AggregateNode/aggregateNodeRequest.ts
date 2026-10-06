import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { Schema } from 'effect';
export const AggregateNodeRequestSchema = Schema.Struct({
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  systemName: Schema.String,
  aggregateName: Schema.String,
  aggregateVersion: Schema.String,
  sessionName: Schema.String,
  lock: AggregateSessionLockSchema,
});
export type IAggregateNodeRequest = typeof AggregateNodeRequestSchema.Type;
