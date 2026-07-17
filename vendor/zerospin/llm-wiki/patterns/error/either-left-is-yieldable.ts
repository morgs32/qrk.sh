import { Effect, Either } from 'effect';

/**
 * Either Left from decodeRpc is already a yieldable ZerospinError.
 *
 * @bad `return yield* Effect.fail(either.left)` after decodeRpc.
 */
export const callFrontendApi = Effect.fn('callFrontendApi')(function* () {
  const either = yield* makeAsync(() => frontendApi.getFrontendState()).pipe(
    Effect.flatMap(decodeRpc),
  );

  if (Either.isLeft(either)) {
    return yield* either.left;
  }

  return either.right;
});

declare function makeAsync<A>(
  fn: () => Promise<A>,
): Effect.Effect<A, unknown, unknown>;
declare function decodeRpc<A>(
  effect: Effect.Effect<A, unknown, unknown>,
): Effect.Effect<Either.Either<A, ZerospinError>, unknown, unknown>;
declare const frontendApi: {
  getFrontendState: () => Promise<unknown>;
};
declare class ZerospinError {}
