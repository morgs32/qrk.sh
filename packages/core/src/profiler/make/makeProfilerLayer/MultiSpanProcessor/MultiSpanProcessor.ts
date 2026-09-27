import type { Context as OtelContext } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export class MultiSpanProcessor implements SpanProcessor {
  constructor(private readonly processors: SpanProcessor[]) {}

  async forceFlush(): Promise<void> {
    await Promise.all(
      this.processors.map(p => {
        return p.forceFlush();
      }),
    );
  }

  onEnd(span: ReadableSpan) {
    for (const p of this.processors) {
      p.onEnd(span);
    }
  }

  onStart(span: Span, ctx: OtelContext) {
    for (const p of this.processors) {
      p.onStart(span, ctx);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.processors.map(p => {
        return p.shutdown();
      }),
    );
  }
}
