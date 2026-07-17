import { Effect, Either } from 'effect';
import type { YieldWrap } from 'effect/Utils';

import { Profiler } from './makeProfilerLayer.ts';
import { ProfilerError } from './ProfilerError.ts';

export function profile<NAME extends string>(name: NAME) {
  return <
    YIELD_WRAP extends YieldWrap<Effect.Effect<any, any, any>>,
    RESULTS,
    ARGS extends any[],
  >(
    fn: (...args: ARGS) => Generator<YIELD_WRAP, RESULTS, never>,
  ): ((
    ...args: ARGS
  ) => Effect.Effect<
    RESULTS,
    [YIELD_WRAP] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>]
      ? E
      : never,
    | Profiler
    | ([YIELD_WRAP] extends [
        YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>,
      ]
        ? R
        : never)
  >) => {
    const wrappedFn = Effect.fn(name)(function* (...args: ARGS) {
      const profiler = yield* Profiler;
      const currentSpan = yield* Effect.currentSpan.pipe(
        Effect.either,
        Effect.map(maybeSpan => {
          if (Either.isLeft(maybeSpan)) {
            // TODO: Should we use ZerospinError instead?
            throw new ProfilerError(
              'failed-to-get-current-span',
              maybeSpan.left.message,
              maybeSpan.left,
            );
          }
          return maybeSpan.right;
        }),
      );
      yield* profiler.addArgs(currentSpan.spanId, args);
      const results = yield* Effect.gen(() => {
        const gen = fn(...args);
        return gen;
      });
      yield* profiler.addResults(currentSpan.spanId, results);
      return results;
    });
    return wrappedFn;
  };
}
