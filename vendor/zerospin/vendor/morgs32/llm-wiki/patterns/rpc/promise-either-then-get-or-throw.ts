import { Either } from 'effect';

declare function withOrdersApi<T>(
  fn: (client: {
    getOrder(props: {
      orderId: string;
    }): Promise<Either.Either<T, unknown>>;
  }) => Promise<Either.Either<T, unknown>>,
): Promise<Either.Either<T, unknown>>;

declare function cachedFindManyOrders(): Promise<
  Either.Either<readonly unknown[], unknown>
>;

/**
 * Unwrap `Promise<Either>` with `.then(Either.getOrThrowWith(left => left))`, not `getOrThrowWith(await …)`.
 *
 * @bad `if (Either.isLeft(either)) { throw either.left; }` when Left is always thrown as-is.
 * @bad `Either.getOrThrowWith(await promiseEither, left => left)` — couples async to the wrong helper.
 */
export async function loadOrder(orderId: string) {
  const maybeOrder = await withOrdersApi(client =>
    client.getOrder({ orderId }),
  ).then(Either.getOrThrowWith(left => left));

  return maybeOrder;
}

export async function loadOrders() {
  const orders = await cachedFindManyOrders().then(
    Either.getOrThrowWith(left => left),
  );

  return orders;
}
