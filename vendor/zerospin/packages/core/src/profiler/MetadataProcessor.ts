import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type IMetadata = Record<string | symbol, unknown>;

export type IMetadataStore = StoreApi<IMetadata>;

export class MetadataProcessor implements SpanProcessor {
  readonly metadataBySpanId: Map<string, IMetadataStore>;

  constructor() {
    this.metadataBySpanId = new Map<string, IMetadataStore>();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  onEnd(_span: ReadableSpan) {
    /* no-op */
  }

  onStart(span: Span) {
    const store = createStore<IMetadata>(() => {
      return {};
    });
    this.metadataBySpanId.set(span.spanContext().spanId, store);
  }

  reset() {
    /**
     * TODO: Maybe we have to just detach reference??
     * Let garbage collector take care of it.
     */
    this.metadataBySpanId.clear();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
