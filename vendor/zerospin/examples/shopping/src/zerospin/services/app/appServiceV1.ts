import { RoutePattern } from '@remix-run/route-pattern';
import { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import {
  catalogIdentitySchema,
  clerkCredentialsSchema,
} from '../../identities';
import { verifyClerkIdentity } from '../../verifyClerkIdentity';

import { createCatalogMarkerV1 } from './contracts/createCatalogMarker/CreateCatalogMarkerV1';
import { createProductV1 } from './contracts/createProduct/CreateProductV1';
import { deleteProductV1 } from './contracts/deleteProduct/DeleteProductV1';
import { catalogMarkerV1 } from './models/catalogMarker/CatalogMarkerV1';
import { productV1 } from './models/product/ProductV1';

const catalogDb = sdk.makeActorDbVersion({
  models: { catalogMarker: catalogMarkerV1, product: productV1 },
});
const catalogIdentity = sdk.makeActorIdentity({
  schema: catalogIdentitySchema,
  actorPath: RoutePattern.parse('/:clerkUserId'),
});
export const appServiceV1 = sdk.makeService({
  actors: {
    '1.0.0': {
      default: makeServiceActorVersion(
        defineServiceActor({ name: 'default' }),
        {
          authentication: {
            credentialsSchema: clerkCredentialsSchema,
            authenticate: ({ credentials }) =>
              verifyClerkIdentity(credentials).pipe(
                Effect.map(clerkUserId => ({ clerkUserId })),
              ),
          },
          version: '1.0.0',
          authorize: () => Effect.void,
          db: catalogDb,
          identity: catalogIdentity,
          queries: {
            catalogMarker: catalogDb.query.catalogMarker.findMany({}),
            product: catalogDb.query.product.findMany({}),
          },
        },
      ),
    },
  },

  name: 'app',
  module: {
    '1.0.0': {
      models: { catalogMarker: catalogMarkerV1, product: productV1 },
      contracts: {
        createCatalogMarker: createCatalogMarkerV1,
        createProduct: createProductV1,
        deleteProduct: deleteProductV1,
      },
      automations: {},
    },
  },
  queries: {
    '1.0.0': {
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
            catch: sdk.catchZerospinError({
              code: 'catalog-products-query-failed',
              message: 'Failed to query catalog products',
            }),
          });
        }),
      },
    },
  },
});
