import { Effect, Either } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string });
}

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, DomainError>;

/**
 * After decode, wire Left is already a yieldable domain error — use `return yield* either.left`.
 *
 * @bad `return yield* Effect.fail(either.left)` when Left is yieldable.
 * @bad One-step `Effect.gen` in `decodeRpc` `onLeft` instead of returning the instance directly.
 */
export const loadDecoded = Effect.fn('loadDecoded')(function* (props: {
  encoded: unknown;
}) {
  const { encoded } = props;
  const either = yield* decodeRpc<{ id: string }>(encoded).pipe(Effect.either);

  if (Either.isLeft(either)) {
    return yield* either.left;
  }

  return either.right;
});
