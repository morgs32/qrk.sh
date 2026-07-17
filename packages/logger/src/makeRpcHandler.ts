import { Cause, Effect, Either, Tracer } from 'effect';
import type { YieldWrap } from 'effect/Utils';

import { makeTelemetryLayer } from './makeTelemetryLayer.ts';
import {
  makeTelemetryCollector,
  type TelemetryCollector,
} from './TelemetryCollector.ts';
import type { IRpcEnvelope, IRpcRequest } from './types.ts';

export function makeRpcHandler<NAME extends string>(name: NAME) {
  return <
    YIELD_WRAP extends YieldWrap<Effect.Effect<unknown, unknown, unknown>>,
    A,
    ARGS extends Array<unknown>,
  >(
    fn: (...args: ARGS) => Generator<YIELD_WRAP, A, never>,
  ): ((
    request: IRpcRequest<ARGS>,
  ) => Effect.Effect<
    IRpcEnvelope<
      A,
      [YIELD_WRAP] extends [never]
        ? never
        : [YIELD_WRAP] extends [
              YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>,
            ]
          ? E
          : never
    >,
    never,
    Exclude<
      [YIELD_WRAP] extends [never]
        ? never
        : [YIELD_WRAP] extends [
              YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>,
            ]
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
        Effect.either,
        Effect.provide(makeTelemetryLayer(collector)),
        Effect.map(either => ({
          result: Either.isRight(either)
            ? { _tag: 'Right', right: either.right }
            : { _tag: 'Left', left: Cause.originalError(either.left) },
          telemetry: collector.flush(),
        })),
      );
    };
  };
}
