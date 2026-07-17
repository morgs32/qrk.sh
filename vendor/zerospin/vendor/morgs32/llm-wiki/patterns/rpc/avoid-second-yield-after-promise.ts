import { Effect } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;

declare const client: {
  getFrontendState(): Promise<unknown>;
};

/**
 * One piped `yield*` for Either-encoded RPC: `Effect.promise` then `flatMap(decodeRpc)`.
 *
 * @bad Two steps: `const encoded = yield* Effect.promise(...); return yield* decodeRpc(encoded)`.
 */
export const fetchFrontendState = Effect.fn('fetchFrontendState')(function* () {
  return yield* Effect.promise(() => client.getFrontendState()).pipe(
    Effect.flatMap(decodeRpc),
  );
});
