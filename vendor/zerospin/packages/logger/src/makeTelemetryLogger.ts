import {
  Cause,
  Context,
  FiberRef,
  FiberRefs,
  Logger,
  Option,
  Tracer,
} from 'effect';
import { toStringUnknown } from 'effect/Inspectable';

import { makeLogId } from './makeTelemetryIds.ts';
import type { ITelemetryCollector } from './TelemetryCollector.ts';
import type { ILogLevel, ISpanId, ITraceId } from './types.ts';

const levelFromLabel = (label: string): ILogLevel => {
  switch (label) {
    case 'FATAL':
    case 'ERROR':
      return 'error';
    case 'WARN':
      return 'warn';
    case 'DEBUG':
    case 'TRACE':
    case 'ALL':
      return 'debug';
    default:
      return 'info';
  }
};

export const makeTelemetryLogger = (
  collector: ITelemetryCollector,
): Logger.Logger<unknown, void> =>
  Logger.make(options => {
    const fiberContext = FiberRefs.getOrDefault(
      options.context,
      FiberRef.currentContext,
    );
    const span = Option.getOrNull(
      Context.getOption(fiberContext, Tracer.ParentSpan),
    );

    const payload: Record<string, unknown> = Object.fromEntries(
      options.annotations,
    );
    if (!Cause.isEmpty(options.cause)) {
      payload['cause'] = Cause.pretty(options.cause);
    }

    collector.addLog({
      logId: makeLogId(),
      createdAt: options.date.getTime(),
      level: levelFromLabel(options.logLevel.label),
      message: Array.isArray(options.message)
        ? options.message.map(part => toStringUnknown(part)).join(' ')
        : toStringUnknown(options.message),
      source: span !== null && span._tag === 'Span' ? span.name : 'effect',
      payload: Object.keys(payload).length > 0 ? payload : null,
      traceId: span !== null ? (span.traceId as ITraceId) : null,
      spanId: span !== null ? (span.spanId as ISpanId) : null,
    });
  });
