import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import { prefixId } from '@zerospin/core/models/prefixId';
import { ContractError } from '@zerospin/error';
import { makeEffectSchema, primitives } from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { purchaseStateConflict } from './failures.js';
import type { IPurchaseHostModels } from './host.js';
import type { IInternalOptions } from './internalOptions.js';
import { PurchaseQuoteSchema } from './quote.js';
export const makeCreateAcceptedPurchase = <
  const HOST extends IPurchaseHostModels,
  const IDENTITY extends IIdentitySchema,
  const SELECTION extends IIdentitySchema,
>(
  options: IInternalOptions<HOST, IDENTITY, SELECTION>,
) => {
  const { frontend, selectionIdentitySchema, resolveUserId } = options;
  const {
    checkout: checkoutV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
    paymentIntent: paymentIntentV1,
    cartPromotion: cartPromotionV1,
  } = frontend.models;
  const {
    user: userV1,
    cart: cartV1,
    product: productReplicaV1,
  } = frontend.contracts.confirmCheckout.models;
  const createAcceptedPurchase = makeContractVersion(
    defineContract('createAcceptedPurchase'),
    {
      version: '1.0.0',
      identity: selectionIdentitySchema,
      failures: {
        aggregateConflict: purchaseStateConflict,
        conflict: ContractError.schema({ code: 'checkout-conflict' }),
      },
      payload: {
        checkoutId: primitives.foreignKey({ abbreviation: 'chk' }),
        id: primitives.foreignKey({ abbreviation: 'pur' }),
        paymentIntentId: primitives.foreignKey({ abbreviation: 'pmt' }),
        cartId: primitives.foreignKey({ abbreviation: 'crt' }),
        quote: primitives.json({ schema: PurchaseQuoteSchema }),
        expectedExisting: primitives.boolean(),
      },
      models: {
        user: userV1,
        cart: cartV1,
        product: productReplicaV1,
        checkout: checkoutV1,
        purchase: purchaseV1,
        purchaseItem: purchaseItemV1,
        paymentIntent: paymentIntentV1,
        cartPromotion: cartPromotionV1,
      },
      guard: Effect.fn('createAcceptedPurchase.guard')(function* ({
        payload,
        identity,
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
        if (
          checkout === undefined ||
          checkout.userId !== resolveUserId({ queryDb: db, identity }) ||
          checkout?.cartId !== payload.cartId ||
          checkout.purchaseId !== payload.id ||
          checkout.firstPaymentIntentId !== payload.paymentIntentId ||
          checkout.quote !== JSON.stringify(payload.quote)
        ) {
          return yield* failures.conflict.make({
            message: 'Purchase must match its accepted checkout.',
          });
        }
        const existing = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toEncoded(makeEffectSchema(purchaseV1.propertiesShape)),
          ),
        )(db.query.purchase.findMany().sync()).find(
          row => row.id === payload.id,
        );
        if (payload.expectedExisting) {
          const intent = Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toEncoded(
                makeEffectSchema(paymentIntentV1.propertiesShape),
              ),
            ),
          )(db.query.paymentIntent.findMany().sync()).find(
            row => row.id === payload.paymentIntentId,
          );
          const lines = Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toEncoded(
                makeEffectSchema(purchaseItemV1.propertiesShape),
              ),
            ),
          )(db.query.purchaseItem.findMany().sync()).filter(
            row => row.purchaseId === payload.id,
          );
          if (
            existing?.cartId !== payload.cartId ||
            intent?.purchaseId !== payload.id ||
            existing.totalAmount !== payload.quote.totalAmount ||
            existing.promotionReservationId !==
              payload.quote.promotionReservationId ||
            lines.length !== payload.quote.items.length ||
            lines.some(
              line =>
                !payload.quote.items.some(
                  item =>
                    line.id ===
                      prefixId(
                        purchaseItemV1,
                        `${payload.id}_${item.cartItemId}`,
                      ) &&
                    line.productId === item.productId &&
                    line.name === item.name &&
                    line.quantity === item.quantity &&
                    line.unitAmount === item.unitAmount,
                ),
            )
          ) {
            return yield* failures.conflict.make({
              message: 'Purchase identity has different contents.',
            });
          }
          return;
        }
        if (existing !== undefined || checkout.status !== 'accepted') {
          return yield* failures.conflict.make({
            message: 'Checkout is not awaiting purchase creation.',
          });
        }
        if (payload.quote.promotionReservationId !== null) {
          const promotion = Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toEncoded(
                makeEffectSchema(cartPromotionV1.propertiesShape),
              ),
            ),
          )(db.query.cartPromotion.findMany().sync()).find(
            row => row.id === payload.quote.promotionReservationId,
          );
          if (
            promotion?.status !== 'committed' ||
            promotion.purchaseId !== payload.id
          ) {
            return yield* failures.conflict.make({
              message:
                'Commit the reservation to this purchase before creating it.',
            });
          }
        }
      }),
      program: ({ payload, models }) =>
        Effect.gen(function* () {
          if (payload.expectedExisting) return [];
          const quote = payload.quote;
          return [
            yield* models.purchase.create({
              resourceId: payload.id,
              attributes: {
                cartId: payload.cartId,
                currency: quote.currency,
                subtotalAmount: quote.subtotalAmount,
                discountAmount: quote.discountAmount,
                promotionReservationId: quote.promotionReservationId,
                totalAmount: quote.totalAmount,
                status: 'unpaid',
              },
            }),
            ...(yield* Effect.forEach(quote.items, item =>
              models.purchaseItem.create({
                resourceId: prefixId(
                  purchaseItemV1,
                  `${payload.id}_${item.cartItemId}`,
                ),
                attributes: {
                  purchaseId: payload.id,
                  productId: item.productId,
                  name: item.name,
                  quantity: item.quantity,
                  unitAmount: item.unitAmount,
                },
              }),
            )),
            yield* models.paymentIntent.create({
              resourceId: payload.paymentIntentId,
              attributes: {
                purchaseId: payload.id,
                status: 'pending',
                providerReference: null,
                failure: null,
              },
            }),
            yield* models.checkout.update({
              resourceId: payload.checkoutId,
              attributes: { status: 'paying' },
            }),
          ];
        }),
    },
  );

  return createAcceptedPurchase;
};
