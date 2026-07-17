import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTraceableApiTarget } from './makeTraceableApiTarget.ts';
import {
  makeTelemetryCollector,
  TelemetryCollector,
} from './TelemetryCollector.ts';
import type {
  ILinkedRpcEnvelope,
  IRpcRequest,
  ISpanLinkRecord,
  ITraceContext,
} from './types.ts';

describe('makeTraceableApiTarget', () => {
  it('supplies the current span, decodes success, and collects the returned link', async () => {
    let receivedTraceContext: ITraceContext | null = null;
    const link: ISpanLinkRecord = {
      linkId: 'lnk_server-boundary',
      traceId: 'trc_server',
      spanId: 'spn_server-root',
      priorTraceId: 'trc_browser',
      priorSpanId: 'spn_browser-call',
      kind: 'causedBy',
    };
    const rawApiTarget = {
      double: (
        request: IRpcRequest<[number]>,
      ): Promise<ILinkedRpcEnvelope<number, 'domain-error'>> => {
        receivedTraceContext = request.traceContext;
        return Promise.resolve({
          result: { _tag: 'Right', right: request.args[0] * 2 },
          link: {
            ...link,
            priorTraceId: request.traceContext?.traceId ?? link.priorTraceId,
            priorSpanId:
              request.traceContext?.parentSpanId ?? link.priorSpanId,
          },
        });
      },
    };
    const apiTarget = makeTraceableApiTarget(rawApiTarget);
    expectTypeOf(apiTarget.double).returns.toEqualTypeOf<
      Effect.Effect<number, 'domain-error' | Error, TelemetryCollector>
    >();
    const collector = makeTelemetryCollector();

    const value = await Effect.runPromise(
      apiTarget.double(21).pipe(
        Effect.withSpan('Browser.double'),
        Effect.provide(makeTelemetryLayer(collector)),
      ),
    );

    expect(value).toBe(42);
    const telemetry = collector.flush();
    const browserSpan = telemetry.spans.find(
      span => span.name === 'Browser.double',
    );
    if (browserSpan === undefined) {
      throw new Error('expected Browser.double span');
    }
    expect(receivedTraceContext).toEqual({
      traceId: browserSpan.traceId,
      parentSpanId: browserSpan.spanId,
    });
    expect(telemetry.links).toEqual([
      {
        ...link,
        priorTraceId: browserSpan.traceId,
        priorSpanId: browserSpan.spanId,
      },
    ]);
  });

  it('preserves an encoded domain failure and still collects its link', async () => {
    const rawApiTarget = {
      fail: (
        _request: IRpcRequest<[]>,
      ): Promise<ILinkedRpcEnvelope<never, 'domain-error'>> =>
        Promise.resolve({
          result: { _tag: 'Left', left: 'domain-error' },
          link: {
            linkId: 'lnk_failed-call',
            traceId: 'trc_server',
            spanId: 'spn_server-root',
            priorTraceId: 'trc_browser',
            priorSpanId: 'spn_browser-call',
            kind: 'causedBy',
          },
        }),
    };
    const collector = makeTelemetryCollector();

    const error = await Effect.runPromise(
      makeTraceableApiTarget(rawApiTarget)
        .fail()
        .pipe(
          Effect.flip,
          Effect.provide(makeTelemetryLayer(collector)),
        ),
    );

    expect(error).toBe('domain-error');
    expect(collector.flush().links).toHaveLength(1);
  });

  it('does not append a link when the envelope link is null', async () => {
    const rawApiTarget = {
      call: (
        _request: IRpcRequest<[]>,
      ): Promise<ILinkedRpcEnvelope<string, never>> =>
        Promise.resolve({
          result: { _tag: 'Right', right: 'ok' },
          link: null,
        }),
    };
    const collector = makeTelemetryCollector();

    const value = await Effect.runPromise(
      makeTraceableApiTarget(rawApiTarget)
        .call()
        .pipe(Effect.provide(makeTelemetryLayer(collector))),
    );

    expect(value).toBe('ok');
    expect(collector.flush().links).toEqual([]);
  });

  it('normalizes transport rejection to Error', async () => {
    const apiTarget = makeTraceableApiTarget({
      call: (
        _request: IRpcRequest<[]>,
      ): Promise<ILinkedRpcEnvelope<never, never>> =>
        Promise.reject('socket died'),
    });
    const collector = makeTelemetryCollector();

    const error = await Effect.runPromise(
      apiTarget.call().pipe(
        Effect.flip,
        Effect.provide(makeTelemetryLayer(collector)),
      ),
    );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error('expected transport failure to be an Error');
    }
    expect(error.message).toBe('socket died');
  });

  it('normalizes a malformed envelope to Error without collecting a partial link', async () => {
    const apiTarget = makeTraceableApiTarget({
      call: () =>
        Promise.resolve({
          result: { _tag: 'Right', right: 'ok' },
          link: {
            linkId: 'lnk_incomplete',
            traceId: 'trc_server',
            spanId: 'spn_server-root',
            priorTraceId: 'trc_browser',
            kind: 'causedBy',
          },
        }),
    });
    const collector = makeTelemetryCollector();

    const error = await Effect.runPromise(
      apiTarget.call().pipe(
        Effect.flip,
        Effect.provide(makeTelemetryLayer(collector)),
      ),
    );

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error('expected envelope failure to be an Error');
    }
    expect(error.message).toBe(
      'makeTraceableApiTarget expected ILinkedRpcEnvelope',
    );
    expect(collector.flush().links).toEqual([]);
  });
});
