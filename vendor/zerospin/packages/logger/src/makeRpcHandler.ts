import { Effect, Result, Tracer } from 'effect';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  type TelemetryCollector,
} from './TelemetryCollector.ts';
import type { IRpcEnvelope, IRpcRequest } from './types.ts';

export function makeRpcHandler<NAME extends string>(name: NAME) {
  return <
    YIELD_EFFECT extends Effect.Effect<unknown, unknown, unknown>,
    A,
    ARGS extends Array<unknown>,
  >(
    fn: (...args: ARGS) => Generator<YIELD_EFFECT, A, never>,
  ): ((
    request: IRpcRequest<ARGS>,
  ) => Effect.Effect<
    IRpcEnvelope<
      A,
      [YIELD_EFFECT] extends [never]
        ? never
        : [YIELD_EFFECT] extends [Effect.Effect<infer _A, infer E, infer _R>]
          ? E
          : never
    >,
    never,
    Exclude<
      [YIELD_EFFECT] extends [never]
        ? never
        : [YIELD_EFFECT] extends [Effect.Effect<infer _A, infer _E, infer R>]
          ? R
          : never,
      TelemetryCollector
    >
  >) => {
    return request => {
      const { args, traceContext } = request;
      const collector = makeTelemetryCollector();

      const program = Effect.gen(function* () {
        return yield* Effect.gen(() => fn(...args));
      }).pipe(Effect.withSpan(name));

      const parented =
        traceContext === null
          ? program
          : program.pipe(
              Effect.withParentSpan(
                Tracer.externalSpan({
                  traceId: traceContext.traceId,
                  spanId: traceContext.parentSpanId,
                }),
              ),
            );

      return parented.pipe(
        Effect.result,
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.map(result => ({
          result: Result.isSuccess(result)
            ? { _tag: 'Success', success: result.success }
            : { _tag: 'Failure', failure: result.failure },
          telemetry: collector.flush(),
        })),
      );
    };
  };
}
