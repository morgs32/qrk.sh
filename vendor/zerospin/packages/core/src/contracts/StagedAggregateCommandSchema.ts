import { Schema, Tuple } from 'effect';

import { EncodedAggregateCommandSchema } from './CommandSchema.ts';
import { EncodedOperationSchema } from './encodeAppliedOperation.ts';
export const StagedAggregateCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        stagedAt: Schema.DateFromString,
        operations: Schema.Array(EncodedOperationSchema),
      }),
    ),
  );
export type IStagedAggregateCommand = typeof StagedAggregateCommandSchema.Type;
