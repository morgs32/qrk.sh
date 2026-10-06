import { Schema, Tuple } from 'effect';

import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from './CommandSchema.ts';
export const AsyncCommandSchema = Schema.Union([
  ...EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ownerKind: Schema.Literal('aggregate'),
        response: Schema.Json,
      }),
    ),
  ).members,
  Schema.fieldsAssign({
    ownerKind: Schema.Literal('service'),
    response: Schema.Json,
  })(EncodedServiceCommandSchema),
]);
export type IAsyncCommand = typeof AsyncCommandSchema.Type;
