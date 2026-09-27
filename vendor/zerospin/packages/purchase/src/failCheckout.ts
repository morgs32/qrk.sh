import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import { ContractError } from '@zerospin/error';
import { makeEffectSchema, primitives } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { purchaseStateConflict } from './failures.js';
import type { IPurchaseHostModels } from './host.js';
import type { IInternalOptions } from './internalOptions.js';
export const makeFailCheckout = <
  const HOST extends IPurchaseHostModels,
  const IDENTITY extends IIdentitySchema,
  const SELECTION extends IIdentitySchema,
>(
  options: IInternalOptions<HOST, IDENTITY, SELECTION>,
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
    identity: selectionIdentitySchema,
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
      identity,
      queryDb,
      failures,
    }) {
      const row = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(queryDb.query.checkout.findMany().sync()).find(
        row => row.id === payload.id,
      );
      if (
        row === undefined ||
        row.userId !== resolveUserId({ queryDb, identity }) ||
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
