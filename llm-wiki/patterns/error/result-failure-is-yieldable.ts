import { Effect, Result } from 'effect';

/**
 * Result Failure from an Effect boundary already contains a yieldable ZerospinError.
 *
 * @bad Wrap `result.failure` in `Effect.fail` after `Effect.result`.
 */
export const callFrontendApi = Effect.fn('callFrontendApi')(function* () {
  const result = yield* makeAsync(() =>
    frontendApi.getSnapshot({ args: [], traceContext: null }),
  ).pipe(
    Effect.flatMap(decodeRpc),
    Effect.result,
  );

  if (Result.isFailure(result)) {
    return yield* result.failure;
  }

  return result.success;
});

declare function makeAsync<A>(
  fn: () => Promise<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(
  encoded: unknown,
): Effect.Effect<A, ZerospinError, unknown>;
declare const frontendApi: {
  getSnapshot: (request: {
    args: [];
    traceContext: null;
  }) => Promise<unknown>;
};
declare class ZerospinError {}
