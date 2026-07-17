import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

/**
 * This simply increments a counter per on start of each span,
 * so it tracks the call order.
 */
export class StartOrderProcessor implements SpanProcessor {
  readonly startOrderBySpanId = new Map<string, number>();
  private counter = 0;

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  onEnd(_span: ReadableSpan) {
    /* no-op */
  }

  onStart(span: Span) {
    const id = span.spanContext().spanId;
    this.startOrderBySpanId.set(id, ++this.counter);
  }

  reset() {
    this.startOrderBySpanId.clear();
    this.counter = 0;
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
