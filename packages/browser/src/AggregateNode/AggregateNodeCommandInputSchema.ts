import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { Schema, Struct } from 'effect';
export const AggregateNodeCommandInputSchema = Schema.toEncoded(
  Schema.Struct({
    ...Struct.omit(SessionCommandSchema.fields, [
      'sessionId',
      'sessionIndex',
      'pushIndex',
    ]),
  }),
);
