import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { Schema } from 'effect';

const fields = {
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  systemName: Schema.String,
  targetName: Schema.String,
  targetVersion: Schema.String,
  sessionName: Schema.String,
};
export const NodeRequestSchema = Schema.Union([
  Schema.Struct({
    ...fields,
    kind: Schema.Literal('aggregate'),
    lock: AggregateSessionLockSchema,
  }),
  Schema.Struct({
    ...fields,
    kind: Schema.Literal('service'),
    lock: ServiceSessionLockSchema,
  }),
]);
export type INodeRequest = typeof NodeRequestSchema.Type;
