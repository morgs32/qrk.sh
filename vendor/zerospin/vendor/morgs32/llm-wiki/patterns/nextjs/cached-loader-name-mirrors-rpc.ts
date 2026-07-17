import { cache } from 'react';

declare function withOrdersApi<T>(
  fn: (api: { findManyOrders(): Promise<unknown> }) => Promise<T>,
): Promise<T>;

/**
 * Cached loader names mirror the RPC method: `cached` + `findManyOrders`.
 *
 * @bad `cachedOrders` in `cachedOrders.ts` — name reflects entity shape, not the RPC.
 */
export const cachedFindManyOrders = cache(() =>
  withOrdersApi(ordersApi => ordersApi.findManyOrders()),
);
