import { Effect, Result } from 'effect';

import { Profiler } from './makeProfilerLayer.ts';
import { ProfilerError } from './ProfilerError.ts';

export function profile<NAME extends string>(name: NAME) {
  return <
    YIELD extends Effect.Effect<any, any, any>,
    RESULTS,
    ARGS extends any[],
  >(
    fn: (...args: ARGS) => Generator<YIELD, RESULTS, never>,
  ): ((
    ...args: ARGS
  ) => Effect.Effect<
    RESULTS,
    [YIELD] extends [Effect.Effect<infer _A, infer E, infer _R>] ? E : never,
    | Profiler
    | ([YIELD] extends [Effect.Effect<infer _A, infer _E, infer R>] ? R : never)
  >) => {
    const wrappedFn = Effect.fn(name)(function* (...args: ARGS) {
      const profiler = yield* Profiler;
      const currentSpan = yield* Effect.currentSpan.pipe(
        Effect.result,
        Effect.map(maybeSpan => {
          if (Result.isFailure(maybeSpan)) {
            // TODO: Should we use ZerospinError instead?
            throw new ProfilerError(
              'failed-to-get-current-span',
              maybeSpan.failure.message,
              maybeSpan.failure,
            );
          }
          return maybeSpan.success;
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
    return Object.defineProperty(wrappedFn, 'name', {
      configurable: true,
      value: name,
    });
  };
}
