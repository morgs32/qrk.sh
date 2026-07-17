import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  TelemetryCollector,
} from './TelemetryCollector.ts';

describe('makeTelemetryLayer', () => {
  it('provides collector service and captures spans plus logs together', async () => {
    const collector = makeTelemetryCollector();

    const program = Effect.gen(function* () {
      const service = yield* TelemetryCollector;
      expect(service).toBe(collector);
      yield* Effect.logInfo('inside');
    }).pipe(Effect.withSpan('test.layer'));

    await Effect.runPromise(
      program.pipe(Effect.provide(makeTelemetryLayer(collector))),
    );

    const batch = collector.flush();
    expect(batch.spans.map(span => span.name)).toEqual(['test.layer']);
    expect(batch.logs).toHaveLength(1);
    expect(batch.logs[0]!.spanId).toBe(batch.spans[0]!.spanId);
  });
});
