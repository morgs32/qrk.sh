import { SessionCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { Schema, Struct } from 'effect';

export const NodeCommandInputSchema = Schema.toEncoded(
  Schema.Struct(
    Struct.omit(SessionCommandSchema.fields, [
      'sessionId',
      'sessionIndex',
      'pushIndex',
      'admission',
      'execution',
    ]),
  ),
);
