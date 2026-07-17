import { Exit, Option, Tracer, type Context } from 'effect';

import { makeSpanId, makeSpanLinkId, makeTraceId } from './makeTelemetryIds.ts';
import type { ITelemetryCollector } from './TelemetryCollector.ts';
import type {
  ISpanId,
  ISpanLinkKind,
  ISpanLinkRecord,
  ISpanRecord,
  ITraceId,
} from './types.ts';

const nanosToMillis = (nanos: bigint): number => Number(nanos / 1_000_000n);

class CollectorSpan implements Tracer.Span {
  readonly _tag = 'Span' as const;
  readonly spanId: ISpanId;
  readonly traceId: ITraceId;
  readonly sampled = true;
  readonly attributes = new Map<string, unknown>();
  status: Tracer.SpanStatus;
  links: ReadonlyArray<Tracer.SpanLink>;

  constructor(
    readonly name: string,
    readonly parent: Option.Option<Tracer.AnySpan>,
    readonly context: Context.Context<never>,
    links: ReadonlyArray<Tracer.SpanLink>,
    private readonly startTime: bigint,
    readonly kind: Tracer.SpanKind,
    private readonly collector: ITelemetryCollector,
  ) {
    this.spanId = makeSpanId();
    this.traceId = Option.match(parent, {
      onNone: () => makeTraceId(),
      onSome: parentSpan => parentSpan.traceId as ITraceId,
    });
    this.links = links;
    this.status = { _tag: 'Started', startTime };
  }

  attribute(key: string, value: unknown): void {
    this.attributes.set(key, value);
  }

  event(): void {
    // Effect.log* records are captured by makeTelemetryLogger; span events would duplicate them.
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    this.links = [...this.links, ...links];
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    this.status = { _tag: 'Ended', startTime: this.startTime, endTime, exit };
    const spanRecord: ISpanRecord = {
      spanId: this.spanId,
      traceId: this.traceId,
      parentSpanId: Option.match(this.parent, {
        onNone: () => null,
        onSome: parentSpan => parentSpan.spanId as ISpanId,
      }),
      name: this.name,
      status: Exit.isSuccess(exit) ? 'ok' : 'error',
      startedAt: nanosToMillis(this.startTime),
      endedAt: nanosToMillis(endTime),
      attributes:
        this.attributes.size > 0 ? Object.fromEntries(this.attributes) : null,
    };
    this.collector.addSpan(spanRecord);

    if (this.links.length > 0) {
      const linkRecords: ISpanLinkRecord[] = this.links.map(link => ({
        linkId: makeSpanLinkId(),
        traceId: spanRecord.traceId,
        spanId: spanRecord.spanId,
        priorTraceId: link.span.traceId as ITraceId,
        priorSpanId: link.span.spanId as ISpanId,
        kind:
          (link.attributes['kind'] as ISpanLinkKind | undefined) ?? 'causedBy',
      }));
      this.collector.addLinks(linkRecords);
    }
  }
}

export const makeTelemetryTracer = (
  collector: ITelemetryCollector,
): Tracer.Tracer =>
  Tracer.make({
    span: (name, parent, context, links, startTime, kind) =>
      new CollectorSpan(
        name,
        parent,
        context,
        links,
        startTime,
        kind,
        collector,
      ),
    context: f => f(),
  });
