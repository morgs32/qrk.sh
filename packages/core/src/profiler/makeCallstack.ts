import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ZerospinError } from '@zerospin/error';

import { ZerospinProfile } from './makeProfilerLayer.ts';
import type { IMetadataStore } from './MetadataProcessor.ts';

// TODO: This should
export const makeCallstack = (props: {
  metadataBySpanId: Map<string, IMetadataStore>;
  spans: ReadableSpan[];
  startOrderBySpanId: Map<string, number>;
}): ZerospinProfile[] => {
  const { metadataBySpanId, spans, startOrderBySpanId } = props;

  const hash = new Map<string, ZerospinProfile>();
  const list: ZerospinProfile[] = [];

  // Create hash
  for (const span of spans) {
    const metadata =
      metadataBySpanId.get(span.spanContext().spanId)?.getState() ?? {};
    const profile = new ZerospinProfile(span, metadata, []);
    hash.set(profile.id, profile);
    list.push(profile);
  }

  // Build parent-child relationships using start order
  const sortedSpans = [...spans].sort((a, b) => {
    const aOrder = startOrderBySpanId.get(a.spanContext().spanId) ?? 0;
    const bOrder = startOrderBySpanId.get(b.spanContext().spanId) ?? 0;
    return aOrder - bOrder;
  });

  const stack: ZerospinProfile[] = [];

  for (const span of sortedSpans) {
    const profile = hash.get(span.spanContext().spanId);
    if (!profile) {
      throw new ZerospinError({
        code: 'missing-profile',
        message: 'Profile not found for span',
        extra: {
          spanId: span.spanContext().spanId,
        },
      });
    }

    if (!span.parentSpanContext) {
      stack.push(profile);
      continue;
    }

    const { spanId: parentSpanId } = span.parentSpanContext;

    const parent = hash.get(parentSpanId);
    if (!parent) {
      throw new ZerospinError({
        code: 'missing-profile-parent',
        message: 'Parent profile not found for span',
        extra: {
          parentSpanId,
          spanId: profile.id,
        },
      });
    }
    parent.children.push(profile);
  }

  return stack;
};
