import { Effect, Either } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const ordersApi: {
  findManyOrders(): Promise<unknown>;
};

/**
 * Cached loaders exit with decoded `Either`; name encoded locals `eitherEncoded` when both exist.
 *
 * @bad Exporting `Schema.EitherEncoded` from a loader while call sites decode ad hoc.
 * @bad Mixing wire-encoded and decoded `Either` conventions in one exported loader.
 */
export const cachedFindManyOrders = Effect.fn(
  'cachedFindManyOrders',
)(function* () {
  const eitherEncoded = yield* Effect.promise(() =>
    ordersApi.findManyOrders(),
  );

  const either = yield* decodeRpc(eitherEncoded).pipe(Effect.either);

  return either satisfies Either.Either<readonly unknown[], unknown>;
});
