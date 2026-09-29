import type { IAnyAuthoredAggregate } from '@zerospin/core/aggregate/types';
import type { IContract } from '@zerospin/core/contracts/types';
import { captureActorSelections, makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import type { IModel } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import { execute, makeMachine } from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import type { IMachineDb } from '@zerospin/core/machine/types';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { PromotionProvider } from './providers.js';

type ISource = IAnyAuthoredAggregate & {
  models: { checkout: IModel; cartPromotion: IModel; user: IModel };
  contracts: { recordPromotion: IContract; failCheckout: IContract };
};
const Checkout = Schema.Struct({
  id: makeAbbreviationIdSchema('chk'),
  userId: makeAbbreviationIdSchema('usr'),
  cartId: makeAbbreviationIdSchema('crt'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  promotionReservationId: Schema.NullOr(makeAbbreviationIdSchema('prv')),
  status: Schema.String,
});
const Promotion = Schema.Struct({
  id: makeAbbreviationIdSchema('prv'),
  status: Schema.String,
});
const Action = Schema.Literals(['reserve', 'commit', 'redeem', 'release']);
const Common = {
  handled: Schema.Array(Schema.String),
  key: Schema.String,
  action: Action,
  aggregateId: Schema.String,
  checkoutId: makeAbbreviationIdSchema('chk'),
  userId: makeAbbreviationIdSchema('usr'),
  cartId: makeAbbreviationIdSchema('crt'),
  reservationId: makeAbbreviationIdSchema('prv'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  checkoutStatus: Schema.String,
  claims: Schema.Record(Schema.String, Schema.Unknown),
};
const Idle = makeState({ stateName: 'idle', input: { handled: Schema.Array(Schema.String) } });
const Calling = makeState({ stateName: 'calling', input: Common });
const Recording = makeState({
  stateName: 'recording',
  input: {
    ...Common,
    status: Schema.Literals(['reserved', 'committed', 'released', 'redeemed', 'denied']),
    expiresAt: Schema.NullOr(Schema.Number),
    receiptPurchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  },
});
const Failing = makeState({
  stateName: 'failing',
  input: { ...Common, failure: Schema.String },
});
const releasedStatuses = new Set(['canceled', 'removed', 'removing', 'failed']);

/** Drives the reservation lifecycle from selected checkout and promotion rows. */
export function makePurchasePromotionMachine(props: {
  source: ISource;
  claimsForUser: (props: { db: IMachineDb<ISource>; userId: string }) => Readonly<Record<string, unknown>>;
}) {
  const { source, claimsForUser } = props;
  const authoringDb = makeActorDbVersion({ models: source.models });
  const checkoutQuery = authoringDb.query.checkout;
  const promotionQuery = authoringDb.query.cartPromotion;
  const userQuery = authoringDb.query.user;
  if (checkoutQuery === undefined || promotionQuery === undefined || userQuery === undefined) {
    throw new Error('Purchase promotion source models are missing');
  }
  const selections = captureActorSelections(authoringDb, {
    checkout: checkoutQuery.findMany(),
    cartPromotion: promotionQuery.findMany(),
    user: userQuery.findMany(),
  }, Schema.Struct({}));
  const pending = (db: IMachineDb<ISource>) => {
    const checkouts = Schema.decodeUnknownSync(Schema.Array(Checkout))(
      db.query.checkout?.findMany().sync(),
    );
    const promotions = new Map(Schema.decodeUnknownSync(Schema.Array(Promotion))(
      db.query.cartPromotion?.findMany().sync(),
    ).map(row => [row.id, row]));
    return checkouts.flatMap(checkout => {
      const promotion = checkout.promotionReservationId === null
        ? undefined : promotions.get(checkout.promotionReservationId);
      if (promotion === undefined) return [];
      const action: typeof Action.Type | undefined = checkout.status === 'promotion' && promotion.status === 'requested'
        ? 'reserve'
        : checkout.status === 'accepted' && promotion.status === 'reserved'
          ? 'commit'
          : checkout.status === 'paid' && promotion.status === 'committed'
            ? 'redeem'
            : releasedStatuses.has(checkout.status) && promotion.status !== 'released' &&
                promotion.status !== 'redeemed'
              ? 'release'
              : undefined;
      return action === undefined ? [] : [{
        checkout, promotion, action,
        key: `${checkout.id}:${action}:${checkout.status}:${promotion.status}`,
      }];
    });
  };
  const next = (db: IMachineDb<ISource>, handled: readonly string[], aggregateId: string) => {
    const candidate = pending(db).find(row => !handled.includes(row.key));
    if (candidate === undefined) return undefined;
    const { checkout, action, key } = candidate;
    if (checkout.promotionReservationId === null) return undefined;
    return Calling.make({
      handled: [...handled],
      key,
      action,
      aggregateId,
      checkoutId: checkout.id,
      userId: checkout.userId,
      cartId: checkout.cartId,
      reservationId: checkout.promotionReservationId,
      purchaseId: checkout.purchaseId,
      checkoutStatus: checkout.status,
      claims: claimsForUser({ db, userId: checkout.userId }),
    });
  };
  const after = (db: IMachineDb<ISource>, handled: readonly string[], key: string, aggregateId: string) => {
    const completed = [...handled, key];
    return next(db, completed, aggregateId) ?? Idle.make({ handled: completed });
  };
  return makeMachine({
    source,
    selections,
    contracts: {
      recordPromotion: { contract: source.contracts.recordPromotion, target: source },
      failCheckout: { contract: source.contracts.failCheckout, target: source },
    },
    states: { idle: Idle, calling: Calling, recording: Recording, failing: Failing },
    onBootstrap: ({ db }) => Idle.make({ handled: pending(db).map(row => row.key) }),
    routes: {
      idle: {
        onCommand: ({ origin, db, command }) =>
          'aggregateId' in command ? next(db, origin.handled, command.aggregateId) : undefined,
      },
      calling: {
        onCommand: () => undefined,
        onActivation: ({ origin }) => Effect.gen(function* () {
          const provider = yield* PromotionProvider;
          const result = yield* provider({
            action: origin.action,
            aggregateId: origin.aggregateId,
            cartId: origin.cartId,
            reservationId: origin.reservationId,
            purchaseId: origin.purchaseId,
          });
          const common = {
            handled: origin.handled,
            key: origin.key,
            action: origin.action,
            aggregateId: origin.aggregateId,
            checkoutId: origin.checkoutId,
            userId: origin.userId,
            cartId: origin.cartId,
            reservationId: origin.reservationId,
            purchaseId: origin.purchaseId,
            checkoutStatus: origin.checkoutStatus,
            claims: origin.claims,
          };
          if (result.kind === 'rejected') {
            if (origin.checkoutStatus !== 'promotion' && origin.checkoutStatus !== 'accepted') {
              return yield* makeZerospinError({
                code: 'promotion-result-rejected', message: result.reason,
              });
            }
            return Failing.make({ ...common, failure: result.reason });
          }
          return Recording.make({
            ...common,
            status: result.receipt.status,
            expiresAt: result.receipt.expiresAt,
            receiptPurchaseId: result.receipt.purchaseId,
          });
        }),
      },
      recording: {
        onCommand: () => undefined,
        command: ({ origin }) => execute({
          binding: 'recordPromotion',
          aggregateId: origin.aggregateId,
          claims: origin.claims,
          payload: {
            checkoutId: origin.checkoutId,
            id: origin.reservationId,
            status: origin.status,
            expiresAt: origin.expiresAt,
            purchaseId: origin.receiptPurchaseId,
            finalizeRemoval: origin.checkoutStatus === 'removing',
          },
        }),
        onResult: ({ origin, db }) => after(db, origin.handled, origin.key, origin.aggregateId),
      },
      failing: {
        onCommand: () => undefined,
        command: ({ origin }) => execute({
          binding: 'failCheckout',
          aggregateId: origin.aggregateId,
          claims: origin.claims,
          payload: {
            id: origin.checkoutId,
            expected: origin.checkoutStatus,
            failure: origin.failure,
          },
        }),
        onResult: ({ origin, db }) => after(db, origin.handled, origin.key, origin.aggregateId),
      },
    },
  });
}
