import { Effect, Tracer } from 'effect';

import { makeRpcEnvelope } from './makeRpcEnvelope.ts';
import type { IRpcRequest } from './types.ts';

export function makeRpcHandler<NAME extends string>(name: NAME) {
  return <
    YIELD_EFFECT extends Effect.Effect<unknown, unknown, unknown>,
    A,
    ARGS extends Array<unknown>,
  >(
    fn: (...args: ARGS) => Generator<YIELD_EFFECT, A, never>,
  ) => {
    return (request: IRpcRequest<ARGS>) => {
      const { args, traceContext } = request;

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

      return makeRpcEnvelope(parented);
    };
  };
}
