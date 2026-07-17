import { Effect, Either } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const api: {
  list(): Promise<unknown>;
};

/**
 * Return `Either` from loaders — do not mirror its shape with a bespoke success union.
 *
 * @bad `{ success: true; records } | { success: false; code }` after decode.
 * @bad Manual `isLeft` mapping that duplicates what `Either` already encodes.
 */
export const listRecords = Effect.fn('listRecords')(function* () {
  const either = yield* decodeRpc(yield* Effect.promise(() => api.list())).pipe(
    Effect.either,
  );

  return either;
  // caller: Either.match(either, { onLeft: ..., onRight: ... })
});
