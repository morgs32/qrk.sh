import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Plugin } from '@vitest/pretty-format';

import { ZerospinProfile } from '../makeProfilerLayer.ts';

export const spanSerializer: Plugin = {
  serialize(val: ReadableSpan, config, indentation, depth, refs, printer) {
    return printer(
      {
        attributes: val.attributes,
        endTime: val.endTime,
        name: val.name,
        startTime: val.startTime,
      },
      config,
      indentation,
      depth,
      refs,
    );
  },
  test(val: unknown) {
    return (
      Boolean(val) &&
      typeof val === 'object' &&
      val !== null &&
      'constructor' in val &&
      val.constructor.name === 'SpanImpl'
    );
  },
};

export const zerospinProfileSerializer: Plugin = {
  serialize(val: ZerospinProfile, config, indentation, depth, refs, printer) {
    /* eslint-disable perfectionist/sort-objects */
    return printer(
      {
        name: val.name,
        attributes: val.span.attributes,
        children: val.children,
        metadata: val.metadata,
        endTime: val.span.endTime,
        startTime: val.span.startTime,
      },
      config,
      indentation,
      depth,
      refs,
    );
    /* eslint-enable perfectionist/sort-objects */
  },
  test(val: unknown) {
    return val instanceof ZerospinProfile;
  },
};
