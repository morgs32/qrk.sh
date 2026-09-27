import { encodeError, type ErrorJson } from '@zerospin/error';
import { Effect, Result } from 'effect';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  type TelemetryCollector,
} from './TelemetryCollector.ts';
import { emptyTelemetryBatch, type IRpcEnvelope } from './types.ts';

/** Settle typed failures without catching defects or rejected transport promises. */
export function makeRpcEnvelope<A, E, R>(
  program: Effect.Effect<A, E, R>,
  options?: { collectTelemetry: boolean },
): Effect.Effect<
  IRpcEnvelope<A, ErrorJson<E>>,
  never,
  Exclude<R, TelemetryCollector>
> {
  return Effect.suspend(() => {
    const collector = makeTelemetryCollector();
    return Effect.gen(function* () {
      const settled = yield* Effect.result(program);
      if (Result.isSuccess(settled)) {
        return {
          result: { _tag: 'Success' as const, success: settled.success },
          telemetry:
            options?.collectTelemetry === false
              ? emptyTelemetryBatch()
              : collector.flush(),
        };
      }
      const failure = yield* encodeError(settled.failure);
      return {
        result: { _tag: 'Failure' as const, failure },
        telemetry:
          options?.collectTelemetry === false
            ? emptyTelemetryBatch()
            : collector.flush(),
      };
    }).pipe(Effect.provide(makeTelemetryLayer(collector)));
  });
}
