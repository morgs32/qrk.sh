import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { makeEffectSchema } from '@zerospin/schema';
import * as sdk from '@zerospin/sdk/browser';
import { Clock, Effect, Schema } from 'effect';

import type { IPurchaseFrontendOptions, IPurchaseHostModels } from './host.js';
import { makePurchaseModels } from './models.js';
import { makePurchaseQuote, PurchaseQuoteSchema } from './quote.js';
export const makePurchaseFrontendModule = <
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
>(
  options: IPurchaseFrontendOptions<HOST, CLAIMS>,
  domainModels = makePurchaseModels(options.models),
) => {
  const { models: host, claimsSchema, resolveUserId, readQuantity } = options;
  const cartV1: HOST['cart'] = host.cart;
  const cartItemV2: HOST['cartItem'] = host.cartItem;
  const productReplicaV1: HOST['product'] = host.product;
  const userV1: HOST['user'] = host.user;
  const models = domainModels;
  const {
    checkout: checkoutV1,
    purchase: purchaseV1,
    paymentIntent: paymentIntentV1,
    cartPromotion: cartPromotionV1,
  } = models;
  const confirmCheckout = sdk.makeContractVersion(
    sdk.defineContract('confirmCheckout'),
    {
      version: options.contractVersion ?? '1.0.0',
      claims: claimsSchema,
      failures: {
        conflict: sdk.ContractError.schema({ code: 'checkout-conflict' }),
        actorDenied: sdk.ActorError.schema({
          code: 'actor-denied',
          extra: Schema.Struct({ operation: Schema.String }),
        }),
      },
      payload: {
        userId: sdk.primitives.foreignKey({ abbreviation: 'usr' }),
        id: sdk.primitives.foreignKey({ abbreviation: 'chk' }),
        cartId: sdk.primitives.foreignKey({ abbreviation: 'crt' }),
        purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }),
        paymentIntentId: sdk.primitives.foreignKey({ abbreviation: 'pmt' }),
        expected: sdk.primitives.enum({
          values: ['promotion', 'accepted'],
          nullable: true,
        }),
        quote: sdk.primitives.json({ schema: PurchaseQuoteSchema }),
      },
      models: {
        checkout: checkoutV1,
        cart: cartV1,
        cartItem: cartItemV2,
        product: productReplicaV1,
        user: userV1,
        cartPromotion: cartPromotionV1,
        purchase: purchaseV1,
      },
      guard: Effect.fn('confirmCheckout.guard')(function* ({
        payload,
        claims,
        queryDb: db,
        failures,
      }) {
        const userId = resolveUserId({ queryDb: db, claims });
        const cart = Schema.decodeUnknownSync(
          Schema.Array(Schema.toType(makeEffectSchema(cartV1.propertiesShape))),
        )(db.query.cart.findMany().sync()).find(
          row => row.id === payload.cartId,
        );
        if (
          userId === undefined ||
          payload.userId !== userId ||
          cart?.userId !== userId
        ) {
          return yield* failures.conflict.make({
            message: 'This cart does not belong to you.',
          });
        }
        const existing = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
          ),
        )(db.query.checkout.findMany().sync()).find(
          row => row.id === payload.id,
        );
        if (
          existing !== undefined &&
          (existing.cartId !== payload.cartId || existing.userId !== userId)
        ) {
          return yield* failures.conflict.make({
            message: 'Checkout identity conflicts.',
          });
        }
        if (payload.expected === 'accepted') {
          if (
            existing?.purchaseId !== payload.purchaseId ||
            existing.firstPaymentIntentId !== payload.paymentIntentId ||
            JSON.stringify(existing.quote) !== JSON.stringify(payload.quote)
          ) {
            return yield* failures.conflict.make({
              message: 'Accepted checkout contents changed.',
            });
          }
          return;
        }
        if (
          (payload.expected === null && existing !== undefined) ||
          (payload.expected === 'promotion' && existing?.status !== 'promotion')
        ) {
          return yield* failures.conflict.make({
            message: 'Checkout state changed. Review it again.',
          });
        }
        if (
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
            ),
          )(db.query.checkout.findMany().sync())
            .filter(row => row.cartId === payload.cartId)
            .some(
              row =>
                row.id !== payload.id &&
                ['accepted', 'paying', 'declined'].includes(row.status),
            ) ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(purchaseV1.propertiesShape)),
            ),
          )(db.query.purchase.findMany().sync()).find(
            row =>
              row.cartId === payload.cartId && ['unpaid'].includes(row.status),
          ) !== undefined
        ) {
          return yield* failures.conflict.make({
            message: 'Resolve the existing checkout first.',
          });
        }
        const items = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(cartItemV2.propertiesShape)),
          ),
        )(db.query.cartItem.findMany().sync())
          .filter(row => row.cartId === payload.cartId)
          .map(item => ({
            ...item,
            product: Schema.decodeUnknownSync(
              Schema.Array(
                Schema.toType(
                  makeEffectSchema(productReplicaV1.propertiesShape),
                ),
              ),
            )(db.query.product.findMany().sync()).find(
              product => product.id === item.productId,
            )!,
          }));
        if (
          items.length === 0 ||
          items.some(
            item =>
              item.product === undefined || item.product.deletedAt !== null,
          )
        ) {
          return yield* failures.conflict.make({
            message: 'The cart is empty or a product is unavailable.',
          });
        }
        const quote = makePurchaseQuote(
          items.map(item => ({
            ...item,
            amount: readQuantity(
              Schema.decodeUnknownSync(
                Schema.toType(host.cartItem.resourceSchema),
              )(item),
            ),
          })),
          payload.quote.promotionReservationId,
        );
        if (
          JSON.stringify(quote) !== JSON.stringify(payload.quote) ||
          !Number.isSafeInteger(quote.totalAmount) ||
          quote.totalAmount <= 0 ||
          quote.items.some(
            item =>
              !Number.isSafeInteger(item.quantity) ||
              item.quantity <= 0 ||
              !Number.isSafeInteger(item.unitAmount) ||
              item.unitAmount < 0,
          )
        ) {
          return yield* failures.conflict.make({
            message:
              'Your cart or prices changed. Review the total and confirm again.',
          });
        }
        const promotions = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(cartPromotionV1.propertiesShape)),
          ),
        )(db.query.cartPromotion.findMany().sync()).filter(
          row => row.cartId === payload.cartId,
        );
        if (quote.promotionReservationId === null) {
          if (
            promotions.some(row =>
              ['requested', 'reserved', 'committed'].includes(row.status),
            )
          ) {
            return yield* failures.conflict.make({
              message:
                'Remove or resolve the promotion before paying without it.',
            });
          }
        } else {
          const promotion = promotions.find(
            row => row.id === quote.promotionReservationId,
          );
          if (
            existing?.promotionReservationId !== quote.promotionReservationId ||
            promotion?.status !== 'reserved' ||
            (promotion.expiresAt ?? 0) <= (yield* Clock.currentTimeMillis)
          ) {
            return yield* failures.conflict.make({
              message:
                'Wait for a confirmed reservation, or remove the promotion.',
            });
          }
        }
      }),
      program: ({ payload, models }) =>
        Effect.gen(function* () {
          if (payload.expected === 'accepted') return [];
          const attributes = {
            cartId: payload.cartId,
            userId: payload.userId,
            promotionReservationId: payload.quote.promotionReservationId,
            purchaseId: payload.purchaseId,
            firstPaymentIntentId: payload.paymentIntentId,
            quote: payload.quote,
            status: 'accepted' as const,
            failure: null,
          };
          return payload.expected === null
            ? [
                yield* models.checkout.create({
                  resourceId: payload.id,
                  attributes,
                }),
              ]
            : [
                yield* models.checkout.update({
                  resourceId: payload.id,
                  attributes,
                }),
              ];
        }),
    },
  );

  const initiatePayment = sdk.makeContractVersion(
    sdk.defineContract('initiatePayment'),
    {
      version: '1.0.0',
      claims: claimsSchema,
      failures: {
        conflict: sdk.ContractError.schema({ code: 'payment-intent-conflict' }),
        actorDenied: sdk.ActorError.schema({
          code: 'actor-denied',
          extra: Schema.Struct({ operation: Schema.String }),
        }),
      },
      payload: {
        id: sdk.primitives.foreignKey({ abbreviation: 'pmt' }),
        checkoutId: sdk.primitives.foreignKey({ abbreviation: 'chk' }),
        purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }),
        expectedExisting: sdk.primitives.boolean(),
      },
      models: {
        user: userV1,
        cart: cartV1,
        cartPromotion: cartPromotionV1,
        checkout: checkoutV1,
        purchase: purchaseV1,
        paymentIntent: paymentIntentV1,
      },
      guard: Effect.fn('initiatePayment.guard')(function* ({
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
        if (
          checkout === undefined ||
          checkout.userId !== resolveUserId({ queryDb: db, claims }) ||
          checkout.purchaseId !== payload.purchaseId ||
          purchase === undefined
        ) {
          return yield* failures.conflict.make({
            message: 'Purchase not found for this customer.',
          });
        }
        const intents = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(paymentIntentV1.propertiesShape)),
          ),
        )(db.query.paymentIntent.findMany().sync()).filter(
          row => row.purchaseId === payload.purchaseId,
        );
        const existing = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(paymentIntentV1.propertiesShape)),
          ),
        )(db.query.paymentIntent.findMany().sync()).find(
          row => row.id === payload.id,
        );
        if (payload.expectedExisting) {
          if (existing?.purchaseId !== payload.purchaseId) {
            return yield* failures.conflict.make({
              message: 'Payment intent identity conflicts.',
            });
          }
          return;
        }
        if (
          existing !== undefined ||
          purchase.status !== 'unpaid' ||
          checkout.status !== 'declined' ||
          intents.some(intent =>
            ['pending', 'executing', 'uncertain'].includes(intent.status),
          ) ||
          !intents.some(intent => intent.status === 'declined')
        ) {
          return yield* failures.conflict.make({
            message:
              'Retry only after a confirmed decline. An unresolved payment cannot be replaced.',
          });
        }
      }),
      program: ({ payload, models }) =>
        Effect.gen(function* () {
          if (payload.expectedExisting) return [];
          return [
            yield* models.paymentIntent.create({
              resourceId: payload.id,
              attributes: {
                purchaseId: payload.purchaseId,
                status: 'pending',
                providerReference: null,
                failure: null,
              },
            }),
            yield* models.checkout.update({
              resourceId: payload.checkoutId,
              attributes: { status: 'paying', failure: null },
            }),
          ];
        }),
    },
  );

  const cancelCheckoutPurchase = sdk.makeContractVersion(
    sdk.defineContract('cancelPurchase'),
    {
      version: '1.0.0',
      claims: claimsSchema,
      failures: {
        conflict: sdk.ContractError.schema({
          code: 'purchase-cancellation-conflict',
        }),
        actorDenied: sdk.ActorError.schema({
          code: 'actor-denied',
          extra: Schema.Struct({ operation: Schema.String }),
        }),
      },
      payload: {
        checkoutId: sdk.primitives.foreignKey({ abbreviation: 'chk' }),
        purchaseId: sdk.primitives.foreignKey({ abbreviation: 'pur' }),
      },
      models: {
        user: userV1,
        cart: cartV1,
        cartPromotion: cartPromotionV1,
        checkout: checkoutV1,
        purchase: purchaseV1,
        paymentIntent: paymentIntentV1,
      },
      guard: Effect.fn('cancelPurchase.guard')(function* ({
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
        if (
          checkout === undefined ||
          checkout.userId !== resolveUserId({ queryDb: db, claims }) ||
          checkout.purchaseId !== payload.purchaseId ||
          purchase === undefined
        ) {
          return yield* failures.conflict.make({
            message: 'Purchase not found for this customer.',
          });
        }
        if (purchase.status === 'canceled') return;
        if (
          purchase.status !== 'unpaid' ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(paymentIntentV1.propertiesShape)),
            ),
          )(db.query.paymentIntent.findMany().sync())
            .filter(row => row.purchaseId === payload.purchaseId)
            .some(intent =>
              ['pending', 'executing', 'uncertain', 'succeeded'].includes(
                intent.status,
              ),
            )
        ) {
          return yield* failures.conflict.make({
            message: 'A paid or unresolved purchase cannot be canceled.',
          });
        }
      }),
      program: ({ payload, models }) =>
        Effect.all([
          models.purchase.update({
            resourceId: payload.purchaseId,
            attributes: { status: 'canceled' },
          }),
          models.checkout.update({
            resourceId: payload.checkoutId,
            attributes: { status: 'canceled' },
          }),
        ]),
    },
  );

  const applyCheckoutPromotion = sdk.makeContractVersion(
    sdk.defineContract('applyPromotion'),
    {
      version: options.contractVersion ?? '1.0.0',
      claims: claimsSchema,
      failures: {
        conflict: sdk.ContractError.schema({ code: 'promotion-unavailable' }),
        actorDenied: sdk.ActorError.schema({
          code: 'actor-denied',
          extra: Schema.Struct({ operation: Schema.String }),
        }),
      },
      payload: {
        userId: sdk.primitives.foreignKey({ abbreviation: 'usr' }),
        id: sdk.primitives.foreignKey({ abbreviation: 'prv' }),
        checkoutId: sdk.primitives.foreignKey({ abbreviation: 'chk' }),
        cartId: sdk.primitives.foreignKey({ abbreviation: 'crt' }),
      },
      models: {
        checkout: checkoutV1,
        cartPromotion: cartPromotionV1,
        cart: cartV1,
        user: userV1,
        cartItem: cartItemV2,
        purchase: purchaseV1,
      },
      guard: Effect.fn('applyPromotion.guard')(function* ({
        payload,
        claims,
        queryDb: db,
        failures,
      }) {
        const userId = resolveUserId({ queryDb: db, claims });
        const cart = Schema.decodeUnknownSync(
          Schema.Array(Schema.toType(makeEffectSchema(cartV1.propertiesShape))),
        )(db.query.cart.findMany().sync()).find(
          row => row.id === payload.cartId,
        );
        if (
          userId === undefined ||
          payload.userId !== userId ||
          cart?.userId !== userId ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(cartItemV2.propertiesShape)),
            ),
          )(db.query.cartItem.findMany().sync()).find(
            row => row.cartId === payload.cartId,
          ) === undefined
        ) {
          return yield* failures.conflict.make({
            message: 'Add items to your own cart before applying a promotion.',
          });
        }
        const now = yield* Clock.currentTimeMillis;
        if (
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
            ),
          )(db.query.checkout.findMany().sync()).find(
            row => row.id === payload.checkoutId,
          ) !== undefined ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(cartPromotionV1.propertiesShape)),
            ),
          )(db.query.cartPromotion.findMany().sync()).find(
            row => row.id === payload.id,
          ) !== undefined
        ) {
          return yield* failures.conflict.make({
            message: 'Use a new identity when applying a promotion.',
          });
        }
        if (
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(purchaseV1.propertiesShape)),
            ),
          )(db.query.purchase.findMany().sync()).find(
            row =>
              row.cartId === payload.cartId && ['unpaid'].includes(row.status),
          ) !== undefined ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
            ),
          )(db.query.checkout.findMany().sync())
            .filter(row => row.cartId === payload.cartId)
            .some(row =>
              ['accepted', 'paying', 'declined', 'removing'].includes(
                row.status,
              ),
            ) ||
          Schema.decodeUnknownSync(
            Schema.Array(
              Schema.toType(makeEffectSchema(cartPromotionV1.propertiesShape)),
            ),
          )(db.query.cartPromotion.findMany().sync())
            .filter(row => row.cartId === payload.cartId)
            .some(
              row =>
                row.status === 'requested' ||
                row.status === 'committed' ||
                (row.status === 'reserved' && (row.expiresAt ?? 0) > now),
            )
        ) {
          return yield* failures.conflict.make({
            message:
              'Resolve the current checkout or promotion before applying again.',
          });
        }
      }),
      program: ({ payload, models }) =>
        Effect.all([
          models.cartPromotion.create({
            resourceId: payload.id,
            attributes: {
              cartId: payload.cartId,
              status: 'requested',
              expiresAt: null,
              purchaseId: null,
            },
          }),
          models.checkout.create({
            resourceId: payload.checkoutId,
            attributes: {
              cartId: payload.cartId,
              userId: payload.userId,
              promotionReservationId: payload.id,
              purchaseId: null,
              firstPaymentIntentId: null,
              quote: null,
              status: 'promotion',
              failure: null,
            },
          }),
        ]),
    },
  );

  const removeCheckoutPromotion = sdk.makeContractVersion(
    sdk.defineContract('removePromotion'),
    {
      version: '1.0.0',
      claims: claimsSchema,
      failures: {
        conflict: sdk.ContractError.schema({ code: 'promotion-unavailable' }),
        actorDenied: sdk.ActorError.schema({
          code: 'actor-denied',
          extra: Schema.Struct({ operation: Schema.String }),
        }),
      },
      payload: {
        checkoutId: sdk.primitives.foreignKey({ abbreviation: 'chk' }),
      },
      models: {
        user: userV1,
        cart: cartV1,
        cartPromotion: cartPromotionV1,
        checkout: checkoutV1,
      },
      guard: Effect.fn('removePromotion.guard')(function* ({
        payload,
        claims,
        queryDb,
        failures,
      }) {
        const row = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toType(makeEffectSchema(checkoutV1.propertiesShape)),
          ),
        )(queryDb.query.checkout.findMany().sync()).find(
          row => row.id === payload.checkoutId,
        );
        if (
          row === undefined ||
          row.userId !== resolveUserId({ queryDb, claims }) ||
          row.promotionReservationId === null ||
          !['promotion', 'failed', 'removing'].includes(row.status)
        ) {
          return yield* failures.conflict.make({
            message:
              'Cancel an unpaid purchase before releasing its committed promotion.',
          });
        }
      }),
      program: ({ payload, models }) =>
        models.checkout
          .update({
            resourceId: payload.checkoutId,
            attributes: { status: 'removing' },
          })
          .pipe(Effect.map(mutation => [mutation])),
    },
  );

  return {
    models,
    contracts: {
      confirmCheckout,
      initiatePayment,
      cancelPurchase: cancelCheckoutPurchase,
      applyPromotion: applyCheckoutPromotion,
      removePromotion: removeCheckoutPromotion,
    },
    automations: {},
  };
};
