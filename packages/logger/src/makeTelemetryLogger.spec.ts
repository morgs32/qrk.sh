import { Effect, Layer, Logger } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryLogger } from './makeTelemetryLogger.ts';
import { makeTelemetryTracer } from './makeTelemetryTracer.ts';
import { makeTelemetryCollector } from './TelemetryCollector.ts';

describe('makeTelemetryLogger', () => {
  it('captures logs with span ids, level, and annotations', async () => {
    const collector = makeTelemetryCollector();
    const layer = Layer.mergeAll(
      Layer.setTracer(makeTelemetryTracer(collector)),
      Logger.add(makeTelemetryLogger(collector)),
    );

    const program = Effect.gen(function* () {
      yield* Effect.logInfo('started');
      yield* Effect.logWarning('careful');
    }).pipe(
      Effect.annotateLogs({ systemId: 'sys_123' }),
      Effect.withSpan('test.op'),
    );

    await Effect.runPromise(program.pipe(Effect.provide(layer)));

    const { logs, spans } = collector.flush();
    expect(logs).toHaveLength(2);
    const [info, warn] = logs;
    expect(info!.level).toBe('info');
    expect(info!.message).toBe('started');
    expect(info!.source).toBe('test.op');
    expect(info!.payload).toMatchObject({ systemId: 'sys_123' });
    expect(info!.traceId).toBe(spans[0]!.traceId);
    expect(info!.spanId).toBe(spans[0]!.spanId);
    expect(warn!.level).toBe('warn');
  });

  it('captures logs outside any span with null trace ids', async () => {
    const collector = makeTelemetryCollector();
    const layer = Logger.add(makeTelemetryLogger(collector));

    await Effect.runPromise(
      Effect.logError('lonely').pipe(Effect.provide(layer)),
    );

    const { logs } = collector.flush();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe('error');
    expect(logs[0]!.traceId).toBeNull();
    expect(logs[0]!.spanId).toBeNull();
    expect(logs[0]!.source).toBe('effect');
  });
});
