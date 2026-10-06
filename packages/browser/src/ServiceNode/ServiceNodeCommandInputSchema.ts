import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { Schema, Struct } from 'effect';
export const ServiceNodeCommandInputSchema = Schema.toEncoded(
  Schema.Struct({
    serviceName: Schema.String,
    ...Struct.omit(SessionCommandSchema.fields, [
      'sessionId',
      'sessionIndex',
      'pushIndex',
      'aggregateId',
      'aggregateName',
    ]),
  }),
);
