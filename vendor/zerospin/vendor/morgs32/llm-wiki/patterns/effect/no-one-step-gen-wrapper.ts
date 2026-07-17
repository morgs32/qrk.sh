import { Effect } from 'effect';

declare class DomainError extends Error {
  pipe(...ops: unknown[]): unknown;
}

declare function encodeRpc(effect: unknown): Promise<unknown>;

/**
 * Yieldable errors expose `.pipe()` — do not wrap a one-step generator when failure is the only outcome.
 *
 * @bad `Effect.runPromise(Effect.gen(function* () { return yield* expectedError }).pipe(encodeRpc))`.
 */
export const encodeExpectedFailure = (expectedError: DomainError) =>
  Effect.runPromise(expectedError.pipe(encodeRpc));

// Inside Effect.gen:
// const encoded = yield* expectedError.pipe(encodeRpc);
