import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { Schema } from 'effect';
export const ServiceNodeRequestSchema = Schema.Struct({
  apiUrl: Schema.String,
  publishableKey: Schema.String,
  systemName: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String,
  sessionName: Schema.String,
  lock: ServiceSessionLockSchema,
});
export type IServiceNodeRequest = typeof ServiceNodeRequestSchema.Type;
