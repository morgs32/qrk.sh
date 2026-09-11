import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { createCatalogMarkerV1 } from './contracts/createCatalogMarker/CreateCatalogMarkerV1';
import { createProductV1 } from './contracts/createProduct/CreateProductV1';
import { deleteProductV1 } from './contracts/deleteProduct/DeleteProductV1';
import { catalogMarkerV1 } from './models/catalogMarker/CatalogMarkerV1';
import { productV1 } from './models/product/ProductV1';

export const appV1 = sdk.makeService({
  name: 'app',
  version: '1.0.0',
  authorize: () => Effect.void,
  frontends: {
    appFrontend: {
      controller: sdk.makeFrontendController({
        systemName: 'shopping',
        serviceName: 'app',
        serviceVersion: '1.0.0',
        name: 'appFrontend',
        models: { product: productV1 },
      }),
    },
  },
  models: {
    catalogMarker: catalogMarkerV1,
    product: productV1,
  },
  contracts: {
    createCatalogMarker: createCatalogMarkerV1,
    createProduct: createProductV1,
    deleteProduct: deleteProductV1,
  },
  queries: {
    getProducts: {
      paramsSchema: Schema.Struct({}),
      query: Effect.fn('getProducts')(function* ({
        db,
      }: {
        db: Readonly<
          Pick<
            sdk.IDb<
              sdk.IResourceDbConfig<
                {
                  catalogMarker: typeof catalogMarkerV1;
                  product: typeof productV1;
                },
                Record<never, never>
              >
            >,
            'query'
          >
        >;
        params: {};
      }) {
        return yield* Effect.try({
          try: () => db.query.product.findMany().sync(),
          catch: sdk.ZerospinError.catch({
            code: 'catalog-products-query-failed',
            message: 'Failed to query catalog products',
          }),
        });
      }),
    },
  },
});
