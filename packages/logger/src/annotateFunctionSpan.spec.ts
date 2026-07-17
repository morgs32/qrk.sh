import { Effect, Exit, Layer, Redacted } from 'effect';
import { describe, expect, it } from 'vitest';

import { annotateFunctionSpan } from './annotateFunctionSpan.ts';
import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';

describe('annotateFunctionSpan', () => {
  it('captures arguments, a successful result, and preserves existing attributes', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const operation = Effect.fn('test.success')(function* (
      input: Readonly<{ value: number }>,
    ) {
      yield* Effect.annotateCurrentSpan('existing.attribute', 'preserved');
      return { doubled: input.value * 2 };
    }, annotateFunctionSpan);

    const result = await Effect.runPromise(
      operation({ value: 3 }).pipe(Effect.provide(layer)),
    );

    expect(result).toEqual({ doubled: 6 });
    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    expect(span.attributes).toEqual({
      'existing.attribute': 'preserved',
      'function.arguments': [{ value: 3 }],
      'function.result': { doubled: 6 },
    });
  });

  it('captures arguments before failure without adding a result or changing the failure', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const operation = Effect.fn('test.failure')(function* (value: string) {
      yield* Effect.fail('expected failure');
      return value;
    }, annotateFunctionSpan);

    const exit = await Effect.runPromiseExit(
      operation('input').pipe(Effect.provide(layer)),
    );

    expect(exit).toEqual(Exit.fail('expected failure'));
    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    expect(span.attributes).toMatchObject({
      'function.arguments': ['input'],
    });
    expect(span.attributes).not.toHaveProperty('function.result');
  });

  it('masks sensitive property names and Effect Redacted values', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const operation = Effect.fn('test.redaction')(function* (input: unknown) {
      return input;
    }, annotateFunctionSpan);

    await Effect.runPromise(
      operation({
        password: 'visible-password',
        apiKey: 'visible-api-key',
        publishableKey: 'visible-publishable-key',
        signature: 'visible-signature',
        nested: {
          authorization: 'visible-authorization',
          safe: 'visible',
        },
        redacted: Redacted.make('visible-redacted-value'),
      }).pipe(Effect.provide(layer)),
    );

    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    expect(span.attributes?.['function.arguments']).toEqual([
      {
        password: '[Redacted]',
        apiKey: '[Redacted]',
        publishableKey: '[Redacted]',
        signature: '[Redacted]',
        nested: {
          authorization: '[Redacted]',
          safe: 'visible',
        },
        redacted: '[Redacted]',
      },
    ]);
    expect(JSON.stringify(span.attributes)).not.toContain('visible-password');
    expect(JSON.stringify(span.attributes)).not.toContain('visible-api-key');
    expect(JSON.stringify(span.attributes)).not.toContain(
      'visible-publishable-key',
    );
    expect(JSON.stringify(span.attributes)).not.toContain('visible-signature');
    expect(JSON.stringify(span.attributes)).not.toContain(
      'visible-authorization',
    );
    expect(JSON.stringify(span.attributes)).not.toContain(
      'visible-redacted-value',
    );
  });

  it('represents cycles, functions, instances, errors, bigint, symbols, undefined, and non-finite numbers', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const circular: Record<string, unknown> = { label: 'root' };
    circular.self = circular;
    const operation = Effect.fn('test.special-values')(function* (
      input: unknown,
    ) {
      return input;
    }, annotateFunctionSpan);

    await Effect.runPromise(
      operation({
        circular,
        functionValue: function namedFunction() {
          return undefined;
        },
        instance: new Date('2026-01-02T03:04:05.000Z'),
        error: new TypeError('wrong value'),
        bigint: 12n,
        symbol: Symbol('symbol-value'),
        undefined,
        nan: Number.NaN,
        positiveInfinity: Number.POSITIVE_INFINITY,
        negativeInfinity: Number.NEGATIVE_INFINITY,
      }).pipe(Effect.provide(layer)),
    );

    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    expect(span.attributes?.['function.arguments']).toEqual([
      {
        circular: { label: 'root', self: '[Circular]' },
        functionValue: '[Function: namedFunction]',
        instance: '[Instance: Date]',
        error: '[TypeError: wrong value]',
        bigint: '[BigInt: 12]',
        symbol: '[Symbol: symbol-value]',
        undefined: '[Undefined]',
        nan: '[Number: NaN]',
        positiveInfinity: '[Number: Infinity]',
        negativeInfinity: '[Number: -Infinity]',
      },
    ]);
  });

  it('bounds string length, depth, collection entries, and visited values', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const operation = Effect.fn('test.limits')(function* (input: unknown) {
      return input;
    }, annotateFunctionSpan);
    const manyObjectEntries = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`key-${index}`, index]),
    );
    const manyVisitedValues = Array.from({ length: 50 }, (_, index) => ({
      first: index,
      second: index,
      third: index,
      fourth: index,
    }));

    await Effect.runPromise(
      operation({
        longString: 'x'.repeat(2_100),
        deep: { one: { two: { three: { four: true } } } },
        manyArrayEntries: Array.from({ length: 51 }, (_, index) => index),
        manyObjectEntries,
        manyVisitedValues,
      }).pipe(Effect.provide(layer)),
    );

    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    const serializedArguments = JSON.stringify(
      span.attributes?.['function.arguments'],
    );
    expect(serializedArguments).toContain('…[truncated]');
    expect(serializedArguments).toContain('[Depth Limit]');
    expect(serializedArguments).toContain('[2 entries truncated]');
    expect(serializedArguments).toContain('[Visited Value Limit]');
    expect(serializedArguments).not.toContain('key-49');
  });

  it('keeps the function outcome when an argument or result cannot be inspected', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.setTracer(makeTelemetryTracer(collector));
    const unavailable = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('inspection failed');
        },
      },
    );
    const operation = Effect.fn('test.unavailable')(function* (input: unknown) {
      return input;
    }, annotateFunctionSpan);

    const result = await Effect.runPromise(
      operation(unavailable).pipe(Effect.provide(layer)),
    );

    expect(result).toBe(unavailable);
    const span = collector.flush().spans[0];
    if (span === undefined) {
      throw new Error('expected a completed span');
    }
    expect(span.attributes).toEqual({
      'function.arguments': '[Snapshot Unavailable]',
      'function.result': '[Snapshot Unavailable]',
    });
  });
});
