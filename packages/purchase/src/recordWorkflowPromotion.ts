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
export const makeRecordWorkflowPromotion = <
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
    cartPromotion: cartPromotionV1,
  } = frontend.models;
  const {
    user: userV1,
    cart: cartV1,
    product: productReplicaV1,
  } = frontend.contracts.confirmCheckout.models;
  const recordWorkflowPromotion = makeContractVersion(
    defineContract('recordPromotion'),
    {
      version: '1.0.0',
      claims: selectionIdentitySchema,
      failures: {
        aggregateConflict: purchaseStateConflict,
        conflict: ContractError.schema({
          code: 'promotion-observation-conflict',
        }),
      },
      payload: {
        checkoutId: primitives.foreignKey({ abbreviation: 'chk' }),
        id: primitives.foreignKey({ abbreviation: 'prv' }),
        status: primitives.enum({
          values: ['reserved', 'committed', 'released', 'redeemed', 'denied'],
        }),
        expiresAt: primitives.integer({ nullable: true }),
        purchaseId: primitives.foreignKey({
          abbreviation: 'pur',
          nullable: true,
        }),
        finalizeRemoval: primitives.boolean(),
      },
      models: {
        user: userV1,
        cart: cartV1,
        product: productReplicaV1,
        checkout: checkoutV1,
        cartPromotion: cartPromotionV1,
        purchase: purchaseV1,
      },
      guard: Effect.fn('recordPromotion.guard')(function* ({
        payload,
        claims,
        queryDb: db,
        failures,
      }) {
        const checkout = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
          ),
        )(db.query.checkout.findMany().sync()).find(
          row => row.id === payload.checkoutId,
        );
        const promotion = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toEncoded(makeEffectSchema(cartPromotionV1.propertiesShape)),
          ),
        )(db.query.cartPromotion.findMany().sync()).find(
          row => row.id === payload.id,
        );
        if (
          checkout === undefined ||
          checkout.userId !== resolveUserId({ queryDb: db, claims }) ||
          checkout?.promotionReservationId !== payload.id ||
          promotion?.cartId !== checkout.cartId
        ) {
          return yield* failures.conflict.make({
            message: 'Promotion must belong to this workflow.',
          });
        }
        if (
          promotion.status === 'released' ||
          promotion.status === 'redeemed'
        ) {
          if (
            promotion.status !== payload.status ||
            promotion.purchaseId !== payload.purchaseId
          ) {
            return yield* failures.conflict.make({
              message: 'A settled promotion cannot change.',
            });
          }
        }
        if (payload.status === 'reserved' || payload.status === 'denied') {
          if (
            !['requested', 'reserved', 'denied'].includes(promotion.status) ||
            payload.purchaseId !== null
          ) {
            return yield* failures.conflict.make({
              message: 'This promotion is no longer awaiting reservation.',
            });
          }
        }
        if (
          payload.status === 'committed' &&
          (checkout.status !== 'accepted' ||
            checkout.purchaseId !== payload.purchaseId ||
            payload.purchaseId === null ||
            !['reserved', 'committed'].includes(promotion.status))
        ) {
          return yield* failures.conflict.make({
            message: 'Commitment must match the accepted purchase identity.',
          });
        }
        if (payload.status === 'redeemed') {
          const purchase =
            payload.purchaseId === null
              ? undefined
              : Schema.decodeUnknownSync(
                  Schema.Array(
                    Schema.toEncoded(
                      makeEffectSchema(purchaseV1.propertiesShape),
                    ),
                  ),
                )(db.query.purchase.findMany().sync()).find(
                  row => row.id === payload.purchaseId,
                );
          if (
            checkout.status !== 'paid' ||
            checkout.purchaseId !== payload.purchaseId ||
            purchase?.status !== 'paid' ||
            !['committed', 'redeemed'].includes(promotion.status)
          ) {
            return yield* failures.conflict.make({
              message: 'Payment must succeed before redemption.',
            });
          }
        }
        if (payload.status === 'released') {
          if (
            !['removing', 'removed', 'failed', 'canceled'].includes(
              checkout.status,
            ) ||
            (payload.finalizeRemoval &&
              checkout.status !== 'removing' &&
              checkout.status !== 'removed')
          ) {
            return yield* failures.conflict.make({
              message:
                'Release must follow removal, failed acceptance, or cancellation.',
            });
          }
          if (promotion.purchaseId !== payload.purchaseId) {
            return yield* failures.conflict.make({
              message: 'Release purchase identity conflicts.',
            });
          }
        } else if (payload.finalizeRemoval) {
          return yield* failures.conflict.make({
            message: 'Only release can finish removal.',
          });
        }
      }),
      program: ({ payload, models }) =>
        Effect.gen(function* () {
          const promotion = yield* models.cartPromotion.update({
            resourceId: payload.id,
            attributes: {
              status: payload.status,
              expiresAt: payload.expiresAt,
              purchaseId: payload.purchaseId,
            },
          });
          return payload.finalizeRemoval
            ? [
                promotion,
                yield* models.checkout.update({
                  resourceId: payload.checkoutId,
                  attributes: { status: 'removed', failure: null },
                }),
              ]
            : [promotion];
        }),
    },
  );

  return recordWorkflowPromotion;
};
