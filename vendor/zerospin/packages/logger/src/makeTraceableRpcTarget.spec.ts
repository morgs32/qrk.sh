import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { makeRpcHandler } from './makeRpcHandler.ts';
import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import { makeTraceableRpcTarget } from './makeTraceableRpcTarget.ts';
import {
  makeTelemetryCollector,
  TelemetryCollector,
} from './TelemetryCollector.ts';
import type { IRpcEnvelope, IRpcRequest } from './types.ts';

describe('makeTraceableRpcTarget', () => {
  it('produces one trace across two runtimes and merges telemetry', async () => {
    const double = makeRpcHandler('MockRpc.double')(function* (n: number) {
      yield* Effect.logInfo('working');
      return n * 2;
    });
    const mockRpcTarget = {
      double: (request: Parameters<typeof double>[0]) =>
        Effect.runPromise(double(request)),
    };
    const wrappedMockRpcTarget = makeTraceableRpcTarget(mockRpcTarget);
    expectTypeOf(wrappedMockRpcTarget.double).returns.toEqualTypeOf<
      Effect.Effect<number, Error, TelemetryCollector>
    >();
    const localCollector = makeTelemetryCollector();

    const value = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* wrappedMockRpcTarget.double(21);
      }).pipe(
        Effect.withSpan('LocalOp.run'),
        Effect.provide(makeTelemetryLayer(localCollector)),
      ),
    );
    expect(value).toBe(42);

    const batch = localCollector.flush();
    const localSpan = batch.spans.find(span => span.name === 'LocalOp.run')!;
    const remoteSpan = batch.spans.find(
      span => span.name === 'MockRpc.double',
    )!;

    expect(remoteSpan.traceId).toBe(localSpan.traceId);
    expect(remoteSpan.parentSpanId).toBe(localSpan.spanId);

    const remoteLog = batch.logs.find(log => log.message === 'working')!;
    expect(remoteLog.traceId).toBe(localSpan.traceId);
    expect(remoteLog.spanId).toBe(remoteSpan.spanId);
  });

  it('starts a fresh trace when the request carries no parent context', async () => {
    const double = makeRpcHandler('MockRpc.double')(function* (n: number) {
      return n * 2;
    });
    const envelope = await Effect.runPromise(
      double({
        traceContext: null,
        args: [1],
      }),
    );
    expect(envelope.result).toEqual({ _tag: 'Right', right: 2 });
    expect(envelope.telemetry.spans).toHaveLength(1);
    expect(envelope.telemetry.spans[0]!.parentSpanId).toBeNull();
  });

  it('returns domain failures as Left while keeping telemetry', async () => {
    const fail = makeRpcHandler('MockRpc.fail')(function* () {
      return yield* Effect.fail('domain-error' as const);
    });
    const mockRpcTarget = {
      fail: (request: Parameters<typeof fail>[0]) =>
        Effect.runPromise(fail(request)),
    };
    const wrappedMockRpcTarget = makeTraceableRpcTarget(mockRpcTarget);
    const localCollector = makeTelemetryCollector();

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* wrappedMockRpcTarget.fail();
      }).pipe(
        Effect.withSpan('LocalOp.run'),
        Effect.provide(makeTelemetryLayer(localCollector)),
      ),
    );
    expect(exit._tag).toBe('Failure');
    expect(
      localCollector
        .flush()
        .spans.map(span => span.name)
        .sort(),
    ).toEqual(['LocalOp.run', 'MockRpc.fail']);
  });

  it('records a lost span when the transport fails', async () => {
    const flakyMockRpcTarget = makeTraceableRpcTarget({
      double: () => Promise.reject(new Error('socket died')),
    });
    const localCollector = makeTelemetryCollector();

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* flakyMockRpcTarget.double();
      }).pipe(
        Effect.withSpan('LocalOp.run'),
        Effect.provide(makeTelemetryLayer(localCollector)),
      ),
    );
    expect(exit._tag).toBe('Failure');

    const batch = localCollector.flush();
    const lost = batch.spans.find(span => span.status === 'lost')!;
    const local = batch.spans.find(span => span.name === 'LocalOp.run')!;
    expect(lost.name).toBe('double');
    expect(lost.parentSpanId).toBe(local.spanId);
    expect(lost.traceId).toBe(local.traceId);
    expect(lost.startedAt).toBeGreaterThan(0);
    expect(lost.endedAt).toBeGreaterThanOrEqual(lost.startedAt);
  });

  it('declares transport failures in the Error channel', () => {
    const transportFailure = makeTraceableRpcTarget({
      call: (
        _request: IRpcRequest<[]>,
      ): Promise<IRpcEnvelope<never, 'domain-error'>> =>
        Promise.reject('socket died'),
    });

    expectTypeOf(transportFailure.call).returns.toEqualTypeOf<
      Effect.Effect<never, 'domain-error' | Error, TelemetryCollector>
    >();
  });

  it('normalizes transport rejection and invalid envelopes to Error', async () => {
    const transportFailure = makeTraceableRpcTarget({
      call: (
        _request: IRpcRequest<[]>,
      ): Promise<IRpcEnvelope<never, never>> => Promise.reject('socket died'),
    });
    const invalidEnvelope = makeTraceableRpcTarget({
      call: () => Promise.resolve({ result: 'invalid' }),
    });
    const localCollector = makeTelemetryCollector();

    const transportError = await Effect.runPromise(
      transportFailure.call().pipe(
        Effect.flip,
        Effect.provide(makeTelemetryLayer(localCollector)),
      ),
    );
    const envelopeError = await Effect.runPromise(
      invalidEnvelope.call().pipe(
        Effect.flip,
        Effect.provide(makeTelemetryLayer(localCollector)),
      ),
    );

    expect(transportError).toBeInstanceOf(Error);
    expect(envelopeError).toBeInstanceOf(Error);
  });

  it('merges envelope telemetry into the ambient collector', async () => {
    const fail = makeRpcHandler('MockRpc.fail')(function* () {
      return yield* Effect.fail('domain-error' as const);
    });
    const envelope = await Effect.runPromise(
      fail({
        traceContext: null,
        args: [],
      }),
    );
    expect(envelope.result).toEqual({ _tag: 'Left', left: 'domain-error' });
    expect(envelope.telemetry.spans[0]!.status).toBe('error');

    const localCollector = makeTelemetryCollector();
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const collector = yield* TelemetryCollector;
        collector.merge(envelope.telemetry);
        if (envelope.result._tag === 'Left') {
          return yield* Effect.fail(envelope.result.left);
        }
        return envelope.result.right;
      }).pipe(Effect.provide(makeTelemetryLayer(localCollector))),
    );
    expect(exit._tag).toBe('Failure');
    expect(localCollector.flush().spans.map(span => span.name)).toEqual([
      'MockRpc.fail',
    ]);
  });
});
