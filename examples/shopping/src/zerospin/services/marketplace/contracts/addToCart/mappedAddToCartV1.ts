import * as sdk from '@zerospin/sdk';
import { Effect, Schema } from 'effect';

import { productV1 } from '../../models/product/ProductV1';

import { addToCartV1 } from './AddToCartV1';

export const mappedAddToCartV1 = sdk.mapContractVersion({
  contractVersion: addToCartV1,
  operations: { models: { product: productV1 }, contracts: {} },
  result: Schema.Null,
  program: ({ command, db, failures }) =>
    Effect.gen(function* () {
      if (
        !db.query.product
          .findFirst({ where: { id: { eq: command.payload.product.id } } })
          .sync()
      ) {
        yield* failures.productNotFound.make({
          message: 'The catalog product no longer exists.',
        });
      }
      return command.result;
    }),
});
