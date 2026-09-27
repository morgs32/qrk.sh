import { makeAutomation } from '@zerospin/core/automation/makeAutomation';
import type { IAutomation } from '@zerospin/core/automation/types';
import type { IMutations } from '@zerospin/core/contracts/make/makeContractVersion';
import type { IContract } from '@zerospin/core/contracts/types';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import { makeZerospinError } from '@zerospin/error';
import {
  makeAbbreviationIdSchema,
  makeEffectSchema,
  type IAnyShape,
} from '@zerospin/schema';
import '@zerospin/server-only';
import { Effect, Schema } from 'effect';

import { makeCreateAcceptedPurchase } from './createAcceptedPurchase.js';
import { makeFailCheckout } from './failCheckout.js';
import type { IPurchaseHostModels, IUserLookup } from './host.js';
import type { makePurchaseFrontendModule } from './makePurchaseFrontendModule.js';
import type { makePurchaseModels } from './models.js';
import { PaymentProvider, PromotionProvider } from './providers.js';
import { PurchaseQuoteSchema } from './quote.js';
import { makeRecordIntentObservation } from './recordIntentObservation.js';
import { makeRecordPromotionReleases } from './recordPromotionReleases.js';
import { makeRecordWorkflowPromotion } from './recordWorkflowPromotion.js';
type ICartRemoval<H extends IPurchaseHostModels> = IContract<
  string,
  IAnyShape,
  string,
  IMutations,
  Record<string, IAnyShape>,
  { checkout: ReturnType<typeof makePurchaseModels<H>>['checkout'] }
>;
type IFrontend<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
> = ReturnType<typeof makePurchaseFrontendModule<H, I>>;
type ICreateAcceptedPurchase<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeCreateAcceptedPurchase<H, I, S>>;
type IRecordIntentObservation<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeRecordIntentObservation<H, I, S>>;
type IRecordWorkflowPromotion<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeRecordWorkflowPromotion<H, I, S>>;
type IFailCheckout<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeFailCheckout<H, I, S>>;
type IRecordPromotionReleases<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
> = ReturnType<typeof makeRecordPromotionReleases<H, I, S>>;
type IPurchaseModule<
  H extends IPurchaseHostModels,
  I extends IClaimsSchema,
  S extends IClaimsSchema,
  REMOVE extends IContract,
> = {
  models: IFrontend<H, I>['models'];
  contracts: IFrontend<H, I>['contracts'] & {
    createAcceptedPurchase: ICreateAcceptedPurchase<H, I, S>;
    recordPaymentObservation: IRecordIntentObservation<H, I, S>;
    recordPromotion: IRecordWorkflowPromotion<H, I, S>;
    recordPromotionReleases: IRecordPromotionReleases<H, I, S>;
    failCheckout: IFailCheckout<H, I, S>;
  };
  automations: {
    reservePromotion: IAutomation<
      'reservePromotion',
      IFrontend<H, I>['contracts']['applyPromotion'],
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    commitPromotion: IAutomation<
      'commitPromotion',
      IFrontend<H, I>['contracts']['confirmCheckout'],
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    redeemPromotion: IAutomation<
      'redeemPromotion',
      IRecordIntentObservation<H, I, S>,
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    releaseCanceledPromotion: IAutomation<
      'releaseCanceledPromotion',
      IFrontend<H, I>['contracts']['cancelPurchase'],
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    releaseRemovedPromotion: IAutomation<
      'releaseRemovedPromotion',
      IFrontend<H, I>['contracts']['removePromotion'],
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    releaseFailedPromotion: IAutomation<
      'releaseFailedPromotion',
      IFailCheckout<H, I, S>,
      {
        recordPromotion: IRecordWorkflowPromotion<H, I, S>;
        failCheckout: IFailCheckout<H, I, S>;
      },
      PromotionProvider
    >;
    continueAcceptedPurchase: IAutomation<
      'continueAcceptedPurchase',
      IRecordWorkflowPromotion<H, I, S>,
      { createAcceptedPurchase: ICreateAcceptedPurchase<H, I, S> }
    >;
    releaseCartPromotions: IAutomation<
      'releaseCartPromotions',
      REMOVE,
      { recordPromotionReleases: IRecordPromotionReleases<H, I, S> },
      PromotionProvider
    >;
    acceptPurchase: IAutomation<
      'acceptPurchase',
      IFrontend<H, I>['contracts']['confirmCheckout'],
      { createAcceptedPurchase: ICreateAcceptedPurchase<H, I, S> }
    >;
    processPayment: IAutomation<
      'processPayment',
      ICreateAcceptedPurchase<H, I, S>,
      { recordPaymentObservation: IRecordIntentObservation<H, I, S> },
      PaymentProvider
    >;
    retryPayment: IAutomation<
      'retryPayment',
      IFrontend<H, I>['contracts']['initiatePayment'],
      { recordPaymentObservation: IRecordIntentObservation<H, I, S> },
      PaymentProvider
    >;
  };
};
const makePurchaseModuleImpl = <
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
  const REMOVE extends ICartRemoval<HOST>,
>(options: {
  frontend: ReturnType<typeof makePurchaseFrontendModule<HOST, CLAIMS>>;
  recordPaymentObservation?: IRecordIntentObservation<HOST, CLAIMS, SELECTION>;
  selectionIdentitySchema: SELECTION;
  resolveUserId: IUserLookup<HOST, SELECTION>;
  cartContracts: { removeFromCart: REMOVE };
}): IPurchaseModule<HOST, CLAIMS, SELECTION, REMOVE> => {
  const { frontend } = options;
  const { checkout: checkoutV1 } = frontend.models;

  const {
    confirmCheckout,
    initiatePayment,
    cancelPurchase,
    applyPromotion,
    removePromotion,
  } = frontend.contracts;

  const createAcceptedPurchase = makeCreateAcceptedPurchase(options);
  const recordIntentObservation =
    options.recordPaymentObservation ?? makeRecordIntentObservation(options);
  const recordWorkflowPromotion = makeRecordWorkflowPromotion(options);
  const failCheckout = makeFailCheckout(options);
  const recordPromotionReleases = makeRecordPromotionReleases<
    HOST,
    CLAIMS,
    SELECTION
  >(options.selectionIdentitySchema, recordWorkflowPromotion);
  const acceptPurchase = makeAutomation({
    name: 'acceptPurchase',
    on: confirmCheckout,
    contracts: { createAcceptedPurchase },
    program: Effect.fn('acceptPurchase')(function* ({ on, contracts }) {
      if (
        on.payload.expected === 'accepted' ||
        on.payload.quote.promotionReservationId !== null
      ) {
        return null;
      }
      return contracts.createAcceptedPurchase({
        checkoutId: on.payload.id,
        id: on.payload.purchaseId,
        paymentIntentId: on.payload.paymentIntentId,
        cartId: on.payload.cartId,
        quote: on.payload.quote,
        expectedExisting: false,
      });
    }),
  });

  const processPayment = makeAutomation({
    name: 'processPayment',
    on: createAcceptedPurchase,
    contracts: { recordPaymentObservation: recordIntentObservation },
    program: Effect.fn('processPayment')(function* ({ on, contracts }) {
      if (on.payload.expectedExisting) return null;
      const pay = yield* PaymentProvider;
      const observation = yield* pay({
        paymentIntentId: on.payload.paymentIntentId,
        purchaseId: on.payload.id,
        quote: on.payload.quote,
      });
      return contracts.recordPaymentObservation({
        checkoutId: on.payload.checkoutId,
        purchaseId: on.payload.id,
        paymentIntentId: on.payload.paymentIntentId,
        expected: 'pending',
        outcome: observation.outcome,
        providerReference: observation.providerReference,
        cartItemIds: on.payload.quote.items.map(item => item.cartItemId),
      });
    }),
  });

  const retryPayment = makeAutomation({
    name: 'retryPayment',
    on: initiatePayment,
    contracts: { recordPaymentObservation: recordIntentObservation },
    program: Effect.fn('retryPayment')(function* ({ db, on, contracts }) {
      if (on.payload.expectedExisting) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (checkout === undefined) return null;
      const quote = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(PurchaseQuoteSchema),
      )(checkout.quote).pipe(
        Effect.mapError(() => makeZerospinError('invalid-checkout-quote')),
      );
      const pay = yield* PaymentProvider;
      const observation = yield* pay({
        paymentIntentId: on.payload.id,
        purchaseId: on.payload.purchaseId,
        quote,
      });
      return contracts.recordPaymentObservation({
        checkoutId: checkout.id,
        purchaseId: on.payload.purchaseId,
        paymentIntentId: on.payload.id,
        expected: 'pending',
        outcome: observation.outcome,
        providerReference: observation.providerReference,
        cartItemIds: quote.items.map(item => item.cartItemId),
      });
    }),
  });

  const reservePromotion = makeAutomation({
    name: 'reservePromotion',
    on: applyPromotion,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('reservePromotion')(function* ({ db, on, contracts }) {
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'reserve',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const commitPromotion = makeAutomation({
    name: 'commitPromotion',
    on: confirmCheckout,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('commitPromotion')(function* ({ db, on, contracts }) {
      if (on.payload.expected === 'accepted') return null;
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.id,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'commit',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const redeemPromotion = makeAutomation({
    name: 'redeemPromotion',
    on: recordIntentObservation,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('redeemPromotion')(function* ({ db, on, contracts }) {
      if (on.payload.outcome !== 'succeeded') return null;
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'redeem',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const releaseCanceledPromotion = makeAutomation({
    name: 'releaseCanceledPromotion',
    on: cancelPurchase,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('releaseCanceledPromotion')(function* ({
      db,
      on,
      contracts,
    }) {
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'release',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const releaseRemovedPromotion = makeAutomation({
    name: 'releaseRemovedPromotion',
    on: removePromotion,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('releaseRemovedPromotion')(function* ({
      db,
      on,
      contracts,
    }) {
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'release',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const releaseFailedPromotion = makeAutomation({
    name: 'releaseFailedPromotion',
    on: failCheckout,
    contracts: { recordPromotion: recordWorkflowPromotion, failCheckout },
    program: Effect.fn('releaseFailedPromotion')(function* ({
      db,
      on,
      contracts,
    }) {
      if (!('aggregateId' in on)) return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.id,
      );
      if (checkout === undefined || checkout.promotionReservationId === null) {
        return null;
      }
      const provider = yield* PromotionProvider;
      const result = yield* provider({
        action: 'release',
        aggregateId: on.aggregateId,
        cartId: checkout.cartId,
        reservationId: checkout.promotionReservationId,
        purchaseId: checkout.purchaseId,
      });
      if (result.kind === 'rejected') {
        if (checkout.status === 'promotion' || checkout.status === 'accepted') {
          return contracts.failCheckout({
            id: checkout.id,
            expected: checkout.status,
            failure: result.reason,
          });
        }
        return yield* makeZerospinError({
          code: 'promotion-result-rejected',
          message: result.reason,
        });
      }
      return contracts.recordPromotion({
        checkoutId: checkout.id,
        id: checkout.promotionReservationId,
        ...result.receipt,
        finalizeRemoval: checkout.status === 'removing',
      });
    }),
  });
  const continueAcceptedPurchase = makeAutomation({
    name: 'continueAcceptedPurchase',
    on: recordWorkflowPromotion,
    contracts: { createAcceptedPurchase },
    program: Effect.fn('continueAcceptedPurchase')(function* ({
      db,
      on,
      contracts,
    }) {
      if (on.payload.status !== 'committed') return null;
      const checkout = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
        ),
      )(db.query.checkout.findMany().sync()).find(
        row => row.id === on.payload.checkoutId,
      );
      if (
        checkout?.status !== 'accepted' ||
        checkout.purchaseId === null ||
        checkout.firstPaymentIntentId === null
      ) {
        return null;
      }
      const quote = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(PurchaseQuoteSchema),
      )(checkout.quote).pipe(
        Effect.mapError(() => makeZerospinError('invalid-checkout-quote')),
      );
      return contracts.createAcceptedPurchase({
        checkoutId: checkout.id,
        id: checkout.purchaseId,
        paymentIntentId: checkout.firstPaymentIntentId,
        cartId: checkout.cartId,
        quote,
        expectedExisting: false,
      });
    }),
  });
  const releaseCartPromotions = makeAutomation({
    name: 'releaseCartPromotions',
    on: options.cartContracts.removeFromCart,
    contracts: { recordPromotionReleases },
    program: Effect.fn('releaseCartPromotions')(function* ({
      db,
      on,
      contracts,
    }) {
      if (!('aggregateId' in on)) return null;
      const ids = yield* Schema.decodeUnknownEffect(
        Schema.Array(makeAbbreviationIdSchema('chk')),
      )(on.payload.releaseCheckoutIds).pipe(
        Effect.mapError(() => makeZerospinError('invalid-release-checkouts')),
      );
      const provider = yield* PromotionProvider;
      const receipts = [];
      for (const id of ids) {
        const checkout = Schema.decodeUnknownSync(
          Schema.Array(
            Schema.toEncoded(makeEffectSchema(checkoutV1.propertiesShape)),
          ),
        )(db.query.checkout.findMany().sync()).find(row => row.id === id);
        if (
          checkout === undefined ||
          checkout.promotionReservationId === null
        ) {
          continue;
        }
        const result = yield* provider({
          action: 'release',
          aggregateId: on.aggregateId,
          cartId: checkout.cartId,
          reservationId: checkout.promotionReservationId,
          purchaseId: checkout.purchaseId,
        });
        if (
          result.kind === 'rejected' ||
          result.receipt.status !== 'released'
        ) {
          return yield* makeZerospinError('promotion-release-not-confirmed');
        }
        receipts.push({
          checkoutId: checkout.id,
          id: checkout.promotionReservationId,
          status: 'released' as const,
          expiresAt: result.receipt.expiresAt,
          purchaseId: result.receipt.purchaseId,
          finalizeRemoval: true,
        });
      }
      return receipts.length === 0
        ? null
        : contracts.recordPromotionReleases({ receipts });
    }),
  });
  return {
    models: frontend.models,
    contracts: {
      confirmCheckout,
      initiatePayment,
      cancelPurchase,
      applyPromotion,
      removePromotion,
      createAcceptedPurchase,
      recordPaymentObservation: recordIntentObservation,
      recordPromotion: recordWorkflowPromotion,
      recordPromotionReleases,
      failCheckout,
    },
    automations: {
      acceptPurchase,
      processPayment,
      retryPayment,
      reservePromotion,
      commitPromotion,
      continueAcceptedPurchase,
      redeemPromotion,
      releaseCanceledPromotion,
      releaseRemovedPromotion,
      releaseFailedPromotion,
      releaseCartPromotions,
    },
  };
};

export function makePurchaseModule<
  const HOST extends IPurchaseHostModels,
  const CLAIMS extends IClaimsSchema,
  const SELECTION extends IClaimsSchema,
  const REMOVE extends ICartRemoval<HOST>,
>(
  options: Parameters<
    typeof makePurchaseModuleImpl<HOST, CLAIMS, SELECTION, REMOVE>
  >[0],
): ReturnType<typeof makePurchaseModuleImpl<HOST, CLAIMS, SELECTION, REMOVE>> {
  return makePurchaseModuleImpl(options);
}
