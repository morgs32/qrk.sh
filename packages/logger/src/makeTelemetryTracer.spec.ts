import { Effect, Layer, Tracer } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';

describe('makeTelemetryTracer', () => {
  it('records parent/child spans sharing one trace', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const child = Effect.fn('test.child')(function* () {
      yield* Effect.void;
      return 1;
    });
    const parent = Effect.fn('test.parent')(function* () {
      return yield* child();
    });

    await Effect.runPromise(parent().pipe(Effect.provide(layer)));

    const { spans } = collector.flush();
    expect(spans.map(span => span.name).sort()).toEqual([
      'test.child',
      'test.parent',
    ]);
    const parentSpan = spans.find(span => span.name === 'test.parent')!;
    const childSpan = spans.find(span => span.name === 'test.child')!;
    expect(parentSpan.parentSpanId).toBeNull();
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(parentSpan.status).toBe('ok');
    expect(parentSpan.endedAt).toBeGreaterThanOrEqual(parentSpan.startedAt);
  });

  it('marks failed spans as error and captures attributes', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const failing = Effect.fail(new Error('boom')).pipe(
      Effect.withSpan('test.failing'),
      Effect.annotateSpans({ systemId: 'sys_123' }),
    );
    await Effect.runPromise(failing.pipe(Effect.ignore, Effect.provide(layer)));

    const { spans } = collector.flush();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('error');
    expect(spans[0]!.attributes).toMatchObject({ systemId: 'sys_123' });
  });

  it('serializes span links with kind from link attributes', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));

    const linked = Effect.void.pipe(
      Effect.withSpan('test.linked', {
        links: [
          {
            _tag: 'SpanLink',
            span: Tracer.externalSpan({
              traceId: 'trc_prior',
              spanId: 'spn_prior',
            }),
            attributes: { kind: 'retryOf' },
          },
        ],
      }),
    );
    await Effect.runPromise(linked.pipe(Effect.provide(layer)));

    const { links, spans } = collector.flush();
    expect(links[0]!.linkId).toMatch(/^lnk_[0-9a-f]{16}$/);
    expect(links).toEqual([
      {
        linkId: links[0]!.linkId,
        traceId: spans[0]!.traceId,
        spanId: spans[0]!.spanId,
        priorTraceId: 'trc_prior',
        priorSpanId: 'spn_prior',
        kind: 'retryOf',
      },
    ]);
  });
});
