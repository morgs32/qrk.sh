import { PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';

/** A completed operation owns its timing and failure; pending/skipped work has neither. */
export const ExecutionSummarySchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending') }),
  Schema.Struct({
    status: Schema.Literal('succeeded'),
    startedAt: Schema.DateFromString,
    completedAt: Schema.DateFromString,
  }),
  Schema.Struct({
    status: Schema.Literal('failed'),
    startedAt: Schema.DateFromString,
    completedAt: Schema.DateFromString,
    failure: PublicFailureSchema,
  }),
  Schema.Struct({
    status: Schema.Literal('skipped'),
    reason: Schema.Literals(['admission-failed', 'local-only']),
  }),
]);
