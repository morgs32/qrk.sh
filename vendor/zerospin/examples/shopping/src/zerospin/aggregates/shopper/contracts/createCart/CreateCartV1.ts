import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { userClaims } from '../../../../claims';
import { cart } from '../../models/cart/cart';
import { cartV1 } from '../../models/cart/CartV1';
import { user } from '../../models/user/user';
import { userV1 } from '../../models/user/UserV1';

import { createCart } from './createCart';
export const createCartV1 = sdk.makeContractVersion(createCart, {
  claims: userClaims,
  failures: {
    actorDenied: sdk.ActorError.schema({
      code: 'actor-denied',
      extra: Schema.Struct({ operation: Schema.String }),
    }),
    userNotFound: sdk.ContractError.schema({
      code: 'user-not-found',
    }),
    userOwnerMismatch: sdk.ContractError.schema({
      code: 'user-owner-mismatch',
    }),
  },
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: cart.abbreviation }),
    userId: sdk.primitives.foreignKey({ abbreviation: user.abbreviation }),
  },

  models: { cart: cartV1, user: userV1 },
  guard: Effect.fn('createCartV1.guard')(function* ({
    failures,
    payload,
    claims,
    db,
  }) {
    const resource = yield* Effect.try({
      try: () =>
        db.query.user
          .findFirst({ where: { id: { eq: payload.userId } } })
          .sync(),
      catch: sdk.catchZerospinError({
        code: 'user-guard-query-failed',
        message: 'Failed to query user during guard evaluation',
      }),
    });
    if (resource === undefined) {
      return yield* Effect.fail(
        failures.userNotFound.make({
          message: `user ${payload.userId} was not found`,
        }),
      );
    }

    const user = db.query.user
      .findFirst({ where: { clerkUserId: { eq: claims.clerkUserId } } })
      .sync();
    if (user?.id !== resource.id) {
      return yield* Effect.fail(
        failures.userOwnerMismatch.make({
          message: 'This user belongs to another shopper.',
        }),
      );
    }
  }),
  program: ({ payload, models }) =>
    Effect.gen(function* () {
      const { id, userId } = payload;
      return yield* Effect.all([
        models.cart.create({
          resourceId: id,
          attributes: { userId },
        }),
      ]);
    }),
  version: '1.0.0',
});
