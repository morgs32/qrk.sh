import { Schema } from 'effect';

import type { ITelemetryBatch } from './types.ts';

const TraceId = Schema.String.check(Schema.isPattern(/^trc_/));
const SpanId = Schema.String.check(Schema.isPattern(/^spn_/));
const Batch = Schema.Struct({
  spans: Schema.Array(
    Schema.Struct({
      spanId: SpanId,
      traceId: TraceId,
      parentSpanId: Schema.NullOr(SpanId),
      name: Schema.String,
      status: Schema.Literals(['ok', 'error', 'lost']),
      startedAt: Schema.Number,
      endedAt: Schema.Number,
      attributes: Schema.NullOr(Schema.Record(Schema.String, Schema.Json)),
    }),
  ),
  logs: Schema.Array(
    Schema.Struct({
      logId: Schema.String.check(Schema.isPattern(/^lgr_/)),
      createdAt: Schema.Number,
      level: Schema.Literals(['debug', 'info', 'warn', 'error']),
      message: Schema.String,
      source: Schema.String,
      payload: Schema.NullOr(Schema.Json),
      traceId: Schema.NullOr(TraceId),
      spanId: Schema.NullOr(SpanId),
    }),
  ),
  links: Schema.Array(
    Schema.Struct({
      linkId: Schema.String.check(Schema.isPattern(/^lnk_/)),
      traceId: TraceId,
      spanId: SpanId,
      priorTraceId: TraceId,
      priorSpanId: SpanId,
      kind: Schema.Literals(['causedBy', 'retryOf']),
    }),
  ),
});

export const TelemetryBatchSchema = Schema.declare(
  (value: unknown): value is ITelemetryBatch => Schema.is(Batch)(value),
);
