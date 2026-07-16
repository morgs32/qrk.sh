import { Effect } from 'effect';

declare class DomainError extends Error {
  constructor(props: { code: string; cause?: unknown });
}

declare class OrdersApi {
  constructor(props: { accountId: string; userId: string });
}

declare class OrdersApiFailure {
  constructor(error: unknown);
}

declare const managedRuntime: {
  runPromise<A>(effect: Effect.Effect<A, unknown, never>): Promise<A>;
};

/**
 * Api factories resolve to an RpcTarget handle — use `map` + `catchAll` into a failure stub, not `encodeRpc`.
 *
 * @bad Ending a factory with `encodeRpc` — factories return handles, not wire `EitherEncoded`.
 * @bad Nested generators or manual `if (Either.isLeft)` after inner `Effect.either`.
 * @bad `Effect.mapError` / `mapBoth` when you need a resolving stub — they leave the effect failed.
 */
export const getOrdersApi = () =>
  managedRuntime.runPromise(
    Effect.gen(function* () {
      const accountId = 'account_1';
      const userId = 'user_1';
      return { accountId, userId };
    }).pipe(
      Effect.map(props => new OrdersApi(props)),
      Effect.catchAll(error => Effect.succeed(new OrdersApiFailure(error))),
    ),
  );
