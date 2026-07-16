import { cache } from 'react';

import { Either } from 'effect';

declare function withOrdersApi<T>(
  fn: (api: {
    findFirstOrder(props: {
      orderId: string;
    }): Promise<Either.Either<unknown, unknown>>;
  }) => Promise<Either.Either<unknown, unknown>>,
): Promise<Either.Either<unknown, unknown>>;

/**
 * Shared cached loaders return `Promise<Either<…>>` — unwrap or branch at each RSC callsite.
 *
 * @bad `.then(Either.getOrThrowWith(left => left))` inside the `cache` callback.
 * @bad Forcing every consumer into the same failure mode when layout and page need different handling.
 */
export const cachedFindFirstOrder = cache(async (orderId: string) => {
  return await withOrdersApi(ordersApi =>
    ordersApi.findFirstOrder({ orderId }),
  );
});

// page.tsx — one consumer chooses hard fail:
// const order = await cachedFindFirstOrder(orderId).then(Either.getOrThrowWith(left => left));
