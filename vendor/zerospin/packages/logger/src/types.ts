import type { Schema } from 'effect';

export type ITraceId = `trc_${string}`;
export type ISpanId = `spn_${string}`;
export type ILogId = `lgr_${string}`;
export type ISpanLinkId = `lnk_${string}`;

export type ILogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ISpanStatus = 'ok' | 'error' | 'lost';
export type ISpanLinkKind = 'causedBy' | 'retryOf';

/** Trace context carried in an RPC request; the callee parents its root span to this. */
export type ITraceContext = Readonly<{
  traceId: ITraceId;
  parentSpanId: ISpanId;
}>;

/** Completed span crossing the wire; timestamps are epoch milliseconds. */
export type ISpanRecord = Readonly<{
  spanId: ISpanId;
  traceId: ITraceId;
  parentSpanId: ISpanId | null;
  name: string;
  status: ISpanStatus;
  startedAt: number;
  endedAt: number;
  attributes: Readonly<Record<string, unknown>> | null;
}>;

export type ILogRecord = Readonly<{
  logId: ILogId;
  createdAt: number;
  level: ILogLevel;
  message: string;
  source: string;
  payload: unknown | null;
  traceId: ITraceId | null;
  spanId: ISpanId | null;
}>;

/** Backward-in-time causal edge: the owning span was caused by / retries the prior span. */
export type ISpanLinkRecord = Readonly<{
  linkId: ISpanLinkId;
  traceId: ITraceId;
  spanId: ISpanId;
  priorTraceId: ITraceId;
  priorSpanId: ISpanId;
  kind: ISpanLinkKind;
}>;

export type ITelemetryBatch = Readonly<{
  spans: readonly ISpanRecord[];
  logs: readonly ILogRecord[];
  links: readonly ISpanLinkRecord[];
}>;

export const emptyTelemetryBatch = (): ITelemetryBatch => ({
  spans: [],
  logs: [],
  links: [],
});

/** Wire shape of every cross-boundary RPC response: encoded domain Either plus telemetry. */
export type IRpcEnvelope<A, E = unknown> = Readonly<{
  result: Schema.EitherEncoded<A, E>;
  telemetry: ITelemetryBatch;
}>;

/** Wire shape for an API result linked to separately persisted server telemetry. */
export type ILinkedRpcEnvelope<A, E = unknown> = Readonly<{
  result: Schema.EitherEncoded<A, E>;
  link: ISpanLinkRecord | null;
}>;

/** Wire-carried parent context plus the domain arguments for one RPC call. */
export type IRpcRequest<ARGS extends Array<unknown>> = Readonly<{
  traceContext: ITraceContext | null;
  args: ARGS;
}>;
