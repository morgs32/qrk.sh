import { PublicFailureSchema } from '@zerospin/error';
import { Schema } from 'effect';

/** Terminal execution outcome; committed owned outputs are retained separately. */
export const ExecutionResultSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending') }),
  Schema.Struct({
    status: Schema.Literal('succeeded'),
    contractVersion: Schema.String,
    result: Schema.Json,
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
    reason: Schema.Literal('admission-failed'),
  }),
]);
