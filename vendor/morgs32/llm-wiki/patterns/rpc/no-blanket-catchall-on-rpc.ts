import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; message?: string; cause?: unknown });
  static prettyUnknownFailure(cause: unknown): string;
}

declare function encodeRpc(effect: unknown): Promise<unknown>;

/**
 * Let typed failures propagate to `encodeRpc` — no method-wide `catchAll` that collapses error codes.
 *
 * @bad `.pipe(Effect.catchAll(cause => Effect.fail(new DomainError({ code: 'method-failed' }))), encodeRpc)` around the whole RPC body.
 * @bad Blanket catchAll mistaken for "no unknown exceptions" when it is lossy remapping.
 */
export const getResource = (props: { resourceId: string }) =>
  Effect.runPromise(
    Effect.fn('getResource')(function* () {
      const { resourceId } = props;
      // yield* getByKeyOrThrow, Schema.decodeUnknown, transactions, …
      return { resourceId };
    }).pipe(encodeRpc),
  );

/**
 * Narrow `catchAll` on a sub-effect is OK when remapping one known failure type — not the entire public RPC method.
 */
