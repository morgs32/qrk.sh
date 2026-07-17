import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import { ZerospinProfile } from './makeProfilerLayer.ts';
import type { IMetadataStore } from './MetadataProcessor.ts';

export const makeProfiles = (props: {
  metadataBySpanId: Map<string, IMetadataStore>;
  spans: ReadableSpan[];
}): ZerospinProfile[] => {
  const { metadataBySpanId, spans } = props;

  const list: ZerospinProfile[] = [];

  for (const span of spans) {
    const metadata =
      metadataBySpanId.get(span.spanContext().spanId)?.getState() ?? {};
    const profile = new ZerospinProfile(span, metadata, []);
    list.push(profile);
  }

  return list;
};
