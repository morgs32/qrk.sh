import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { ContractError } from '@zerospin/error';
import { makeEffectSchema, primitives } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { purchaseStateConflict } from './failures.js';
import type { IPurchaseHostModels } from './host.js';
import type { IInternalOptions } from './internalOptions.js';
export const makeFailCheckout = <
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
>(
  options: IInternalOptions<HOST, CLAIMS, SELECTION>,
) => {
  const { frontend, selectionIdentitySchema, resolveUserId } = options;
  const { checkout: checkoutV1, cartPromotion: cartPromotionV1 } =
    frontend.models;
  const {
    user: userV1,
    cart: cartV1,
    product: productReplicaV1,
  } = frontend.contracts.confirmCheckout.models;
  const failCheckout = makeContractVersion(defineContract('failCheckout'), {
    version: '1.0.0',
    claims: selectionIdentitySchema,
    failures: {
      aggregateConflict: purchaseStateConflict,
      conflict: ContractError.schema({ code: 'checkout-conflict' }),
    },
    payload: {
      id: primitives.foreignKey({ abbreviation: 'chk' }),
      expected: primitives.enum({ values: ['promotion', 'accepted'] }),
      failure: primitives.text(),
    },
    models: {
      user: userV1,
      cart: cartV1,
      product: productReplicaV1,
      checkout: checkoutV1,
      cartPromotion: cartPromotionV1,
    },
    guard: Effect.fn('failCheckout.guard')(function* ({
      payload,
      claims,
      db,
      failures,
    }) {
      const row = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(row => row.id === payload.id);
      if (
        row === undefined ||
        row.userId !== resolveUserId({ db, claims }) ||
        row?.status !== payload.expected
      ) {
        return yield* failures.conflict.make({
          message: 'Checkout has advanced beyond this failure.',
        });
      }
    }),
    program: ({ payload, models }) =>
      models.checkout
        .update({
          resourceId: payload.id,
          attributes: { status: 'failed', failure: payload.failure },
        })
        .pipe(Effect.map(mutation => [mutation])),
  });

  return failCheckout;
};
