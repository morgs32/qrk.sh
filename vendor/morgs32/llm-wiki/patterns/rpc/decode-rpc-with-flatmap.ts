import { Effect } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const systemWorker: {
  getSystemSpec(): Promise<unknown>;
};

/**
 * Decode wire RPC with `Effect.flatMap(decodeRpc)` — wire Left lands on the typed failure channel.
 *
 * @bad `Effect.fail(either.left)` when Left is already a yieldable domain error.
 * @bad `Either.getOrThrowWith` inside `Effect.map` — throws become defects, not typed failures.
 */
export const loadSystemSpec = Effect.fn('loadSystemSpec')(function* () {
  const systemSpec = yield* Effect.promise(() =>
    systemWorker.getSystemSpec(),
  ).pipe(Effect.flatMap(decodeRpc));

  return systemSpec;
});
