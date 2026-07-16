import { Effect } from 'effect';

declare function decodeRpc<T>(encoded: unknown): Effect.Effect<T, unknown>;
declare function encodeRpc(effect: unknown): Promise<unknown>;

declare const orderRepo: {
  getTableNames(): Promise<unknown>;
  insertOrder(props: unknown): Promise<unknown>;
};

declare const getOrderRepo: () => typeof orderRepo;

/**
 * Encode at the repo boundary; passthrough gateways return the repo promise unchanged.
 *
 * @bad Re-encoding an already-encoded repo method at a thin gateway.
 * @bad Repo returns `Promise<T>` while gateway uses `Effect.promise(...).pipe(encodeRpc)` — rejections bypass wire Left.
 * @bad `Effect.tryPromise` on an encoded repo method — treats wire Left as success payload.
 */
class OrderRepoPassthroughApi {
  getTableNames() {
    return getOrderRepo().getTableNames();
  }
}

const createOrder = Effect.fn('createOrder')(function* (props: {
  orderId: string;
}) {
  return yield* Effect.promise(() => orderRepo.insertOrder(props)).pipe(
    Effect.flatMap(decodeRpc),
  );
});

export { OrderRepoPassthroughApi, createOrder };
