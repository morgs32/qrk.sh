import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import {
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';
export function runNodeNetwork<A, E extends IAnyError | IZerospinErrorJson>(
  program: Effect.Effect<A, E, Async | TelemetryCollector>,
): Promise<A> {
  return Effect.runPromise(
    program.pipe(
      Effect.provide(AsyncLive),
      Effect.provide(makeTelemetryLayer(makeTelemetryCollector())),
      Effect.timeout('10 seconds'),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(makeZerospinError({ code: 'node-network-unavailable' })),
      ),
      encodeRpcOutcome,
    ),
  ).then(result => {
    if (result._tag === 'Failure') throw makeZerospinError(result.failure);
    return result.success;
  });
}
