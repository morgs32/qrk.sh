import { Schema, Tuple } from 'effect';

import { AsyncCommandInputSchema } from './AsyncCommandInputSchema.ts';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from './CommandSchema.ts';
export const AsyncCommandSchema = Schema.Union([
  ...EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ownerKind: Schema.Literal('aggregate'),
        asyncInput: AsyncCommandInputSchema,
      }),
    ),
  ).members,
  Schema.fieldsAssign({
    ownerKind: Schema.Literal('service'),
    asyncInput: AsyncCommandInputSchema,
  })(EncodedServiceCommandSchema),
]);
export type IAsyncCommand = typeof AsyncCommandSchema.Type;
