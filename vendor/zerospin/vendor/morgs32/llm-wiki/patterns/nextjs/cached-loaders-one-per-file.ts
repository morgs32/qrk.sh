import { cache } from 'react';

declare function withCatalogApi<T>(
  fn: (api: {
    getProduct(props: { productId: string }): Promise<unknown>;
  }) => Promise<T>,
): Promise<T>;

/**
 * One cached loader per file under `cached/`; name mirrors the fetch (`cachedGet*` / `cachedFind*`).
 *
 * @bad `lib/catalogCache.ts` exporting several vague `loadCatalog*` functions.
 * @bad Collapsing RPC `Either` to throw inside the cached callback — see `either-in-shared-cached-loaders.ts`.
 */
export const cachedGetProduct = cache(
  async (productId: string) => {
    return await withCatalogApi(catalogApi =>
      catalogApi.getProduct({ productId }),
    );
  },
);
