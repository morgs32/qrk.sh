/**
 * Yieldable ZerospinError has `.pipe()` — do not wrap in one-step Effect.gen.
 *
 * @bad `Effect.runPromise(Effect.gen(function* () { return yield* expectedError }))`.
 */
export function encodeExpectedRpcFailure(expectedError: ZerospinError) {
  return Effect.runPromise(expectedError.pipe(encodeRpc));
}

export function decodeInsideGenerator(expectedError: ZerospinError) {
  return Effect.gen(function* () {
    const encoded = yield* expectedError.pipe(encodeRpc);
    return encoded;
  });
}

declare class ZerospinError {
  pipe(...fns: unknown[]): unknown;
}
declare function encodeRpc(effect: unknown): unknown;
declare const Effect: {
  runPromise: (effect: unknown) => Promise<unknown>;
  gen: (fn: () => Generator<unknown, unknown, unknown>) => unknown;
};
