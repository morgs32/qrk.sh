import { PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';

import { ExecutionDeltaSchema } from '../models/ExecutionDeltaSchema.ts';

/** Authoritative execution data is retained only by the executing owner and its chain. */
export const ExecutionResultSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending') }),
  Schema.Struct({
    status: Schema.Literal('succeeded'),
    startedAt: Schema.DateFromString,
    completedAt: Schema.DateFromString,
    executionDelta: ExecutionDeltaSchema,
  }),
  Schema.Struct({
    status: Schema.Literal('failed'),
    startedAt: Schema.DateFromString,
    completedAt: Schema.DateFromString,
    failure: PublicFailureSchema,
  }),
  Schema.Struct({
    status: Schema.Literal('skipped'),
    reason: Schema.Literal('admission-failed'),
  }),
]);
