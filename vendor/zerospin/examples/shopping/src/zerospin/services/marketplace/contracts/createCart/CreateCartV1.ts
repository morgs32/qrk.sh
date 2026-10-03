import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { userClaims } from '../../../../claims';
import { cartV1 } from '../../models/cart/CartV1';

import { createCart } from './createCart';

export const createCartV1 = sdk.makeContractVersion(createCart, {
  version: '1.0.0',
  claims: userClaims,
  failures: {
    actorDenied: sdk.ActorError.schema({ code: 'actor-denied' }),
    cartOwnerMismatch: sdk.ContractError.schema({
      code: 'cart-owner-mismatch',
    }),
    cartAlreadyExists: sdk.ContractError.schema({
      code: 'cart-already-exists',
    }),
  },
  models: { cart: cartV1 },
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: 'crt' }),
    userId: sdk.primitives.text(),
  },
  guard: ({ payload, claims, db, failures }) =>
    Effect.gen(function* () {
      if (payload.userId !== claims.clerkUserId) {
        yield* failures.cartOwnerMismatch.make({
          message: 'This cart belongs to another shopper.',
        });
      }
      if (
        db.query.cart
          .findFirst({ where: { userId: { eq: claims.clerkUserId } } })
          .sync()
      ) {
        yield* failures.cartAlreadyExists.make({
          message: 'This shopper already has a cart.',
        });
      }
    }),
  program: ({ payload, models }) =>
    models.cart.create({
      resourceId: payload.id,
      attributes: { userId: payload.userId },
    }),
});
