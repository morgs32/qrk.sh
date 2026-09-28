import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { ContractError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeEffectSchema,
  primitives,
} from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { purchaseStateConflict } from './failures.js';
import type { IPurchaseHostModels } from './host.js';
import type { IInternalOptions } from './internalOptions.js';
export const makeRecordIntentObservation = <
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
>(
  options: IInternalOptions<HOST, CLAIMS, SELECTION>,
) => {
  const { frontend, selectionIdentitySchema, resolveUserId } = options;
  const {
    checkout: checkoutV1,
    purchase: purchaseV1,
    paymentIntent: paymentIntentV1,
    cartPromotion: cartPromotionV1,
  } = frontend.models;
  const {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
  } = frontend.contracts.confirmCheckout.models;
  const recordIntentObservation = makeContractVersion(
    defineContract('recordPaymentObservation'),
    {
      version: options.contractVersion ?? '1.0.0',
      claims: selectionIdentitySchema,
      failures: {
        aggregateConflict: purchaseStateConflict,
        conflict: ContractError.schema({
          code: 'payment-observation-conflict',
        }),
      },
      payload: {
        checkoutId: primitives.foreignKey({ abbreviation: 'chk' }),
        purchaseId: primitives.foreignKey({ abbreviation: 'pur' }),
        paymentIntentId: primitives.foreignKey({ abbreviation: 'pmt' }),
        expected: primitives.enum({
          values: [
            'pending',
            'executing',
            'uncertain',
            'succeeded',
            'declined',
          ],
        }),
        outcome: primitives.enum({
          values: ['succeeded', 'declined', 'uncertain'],
        }),
        providerReference: primitives.text(),
        cartItemIds: primitives.json({
          schema: Schema.Array(makeAbbreviationIdSchema('cit')),
        }),
      },
      models: {
        user: userV1,
        cart: cartV1,
        product: productReplicaV1,
        cartPromotion: cartPromotionV1,
        checkout: checkoutV1,
        purchase: purchaseV1,
        paymentIntent: paymentIntentV1,
        cartItem: cartItemV2,
      },
      guard: Effect.fn('recordPaymentObservation.guard')(function* ({
        payload,
        claims,
        queryDb: db,
        failures,
      }) {
        const checkout = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
          ),
        )(db.query.checkout.findMany().sync()).find(
          row => row.id === payload.checkoutId,
        );
        const purchase = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(purchaseV1.propertiesShape)),
          ),
        )(db.query.purchase.findMany().sync()).find(
          row => row.id === payload.purchaseId,
        );
        const intent = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(paymentIntentV1.propertiesShape)),
          ),
        )(db.query.paymentIntent.findMany().sync()).find(
          row => row.id === payload.paymentIntentId,
        );
        if (
          checkout === undefined ||
          checkout.userId !== resolveUserId({ queryDb: db, claims }) ||
          checkout?.purchaseId !== payload.purchaseId ||
          purchase === undefined ||
          intent?.purchaseId !== purchase.id ||
          intent.status !== payload.expected
        ) {
          return yield* failures.conflict.make({
            message: 'Observation must match this workflow and exact intent.',
          });
        }
        if (intent.status === 'succeeded' || intent.status === 'declined') {
          if (
            intent.status !== payload.outcome ||
            intent.providerReference !== payload.providerReference
          ) {
            return yield* failures.conflict.make({
              message: 'A terminal intent cannot change its outcome.',
            });
          }
          return;
        }
        if (
          purchase.status !== 'unpaid' ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(paymentIntentV1.propertiesShape)),
            ),
          )(db.query.paymentIntent.findMany().sync())
            .filter(row => row.purchaseId === purchase.id)
            .some(
              other =>
                other.id !== intent.id &&
                ['pending', 'executing', 'uncertain', 'succeeded'].includes(
                  other.status,
                ),
            )
        ) {
          return yield* failures.conflict.make({
            message: 'This is not the unresolved intent for the purchase.',
          });
        }
        if (payload.outcome === 'succeeded') {
          const items = Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(cartItemV2.propertiesShape)),
            ),
          )(db.query.cartItem.findMany().sync())
            .filter(row => row.cartId === purchase.cartId)
            .map(item => item.id)
            .sort();
          if (
            JSON.stringify(items) !==
            JSON.stringify([...payload.cartItemIds].sort())
          ) {
            return yield* failures.conflict.make({
              message: 'Cart cleanup must match the accepted purchase.',
            });
          }
        }
      }),
      program: ({ payload, models }) =>
        Effect.gen(function* () {
          if (
            payload.expected === 'succeeded' ||
            payload.expected === 'declined'
          ) {
            return [];
          }
          const observed = yield* models.paymentIntent.update({
            resourceId: payload.paymentIntentId,
            attributes: {
              status: payload.outcome,
              providerReference: payload.providerReference,
              failure:
                payload.outcome === 'declined'
                  ? 'Payment declined.'
                  : payload.outcome === 'uncertain'
                    ? 'Payment outcome is unresolved.'
                    : null,
            },
          });
          const workflow = yield* models.checkout.update({
            resourceId: payload.checkoutId,
            attributes: {
              status:
                payload.outcome === 'succeeded'
                  ? 'paid'
                  : payload.outcome === 'declined'
                    ? 'declined'
                    : 'paying',
              failure:
                payload.outcome === 'declined'
                  ? 'Payment declined. Retry or cancel this purchase.'
                  : null,
            },
          });
          if (payload.outcome !== 'succeeded') return [observed, workflow];
          return [
            observed,
            workflow,
            yield* models.purchase.update({
              resourceId: payload.purchaseId,
              attributes: { status: 'paid' },
            }),
            ...(yield* Effect.forEach(payload.cartItemIds, id =>
              models.cartItem.delete({ resourceId: id }),
            )),
          ];
        }),
    },
  );

  return recordIntentObservation;
};
