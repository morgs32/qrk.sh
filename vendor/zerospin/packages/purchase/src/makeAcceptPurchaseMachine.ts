import type { IAnyAuthoredAggregate } from '@zerospin/core/aggregate/types';
import type { IContract } from '@zerospin/core/contracts/types';
import {
  execute,
  makeMachine,
} from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import type { IMachineDb } from '@zerospin/core/machine/types';
import {
  captureActorSelections,
  makeActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import type { IModel } from '@zerospin/core/models/types';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { PurchaseQuoteSchema } from './quote.js';

type ISource = IAnyAuthoredAggregate & {
  models: {
    checkout: IModel;
    purchase: IModel;
    user: IModel;
    cartPromotion: IModel;
  };
  contracts: { createAcceptedPurchase: IContract };
};
const Checkout = Schema.Struct({
  id: makeAbbreviationIdSchema('chk'),
  userId: makeAbbreviationIdSchema('usr'),
  cartId: makeAbbreviationIdSchema('crt'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  firstPaymentIntentId: Schema.NullOr(makeAbbreviationIdSchema('pmt')),
  promotionReservationId: Schema.NullOr(makeAbbreviationIdSchema('prv')),
  quote: Schema.NullOr(Schema.fromJsonString(PurchaseQuoteSchema)),
  status: Schema.String,
});
const Purchase = Schema.Struct({ id: makeAbbreviationIdSchema('pur') });
const Promotion = Schema.Struct({
  id: makeAbbreviationIdSchema('prv'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  status: Schema.String,
});
const Idle = makeState({
  stateName: 'idle',
  input: { handled: Schema.Array(Schema.String) },
});
const Creating = makeState({
  stateName: 'creating',
  input: {
    handled: Schema.Array(Schema.String),
    checkoutId: makeAbbreviationIdSchema('chk'),
    aggregateId: Schema.String,
    purchaseId: makeAbbreviationIdSchema('pur'),
    paymentIntentId: makeAbbreviationIdSchema('pmt'),
    cartId: makeAbbreviationIdSchema('crt'),
    quote: PurchaseQuoteSchema,
    claims: Schema.Record(Schema.String, Schema.Unknown),
  },
});

/** Accept every new checkout exactly once while one frozen command is in flight. */
export function makeAcceptPurchaseMachine(props: {
  source: ISource;
  claimsForUser: (props: {
    db: IMachineDb<ISource>;
    userId: string;
  }) => Readonly<Record<string, unknown>>;
}) {
  const { source, claimsForUser } = props;
  const authoringDb = makeActorDbVersion({ models: source.models });
  const checkoutQuery = authoringDb.query.checkout;
  const purchaseQuery = authoringDb.query.purchase;
  const userQuery = authoringDb.query.user;
  const promotionQuery = authoringDb.query.cartPromotion;
  if (
    checkoutQuery === undefined ||
    purchaseQuery === undefined ||
    userQuery === undefined ||
    promotionQuery === undefined
  ) {
    throw new Error('Purchase machine source models are missing');
  }
  const selections = captureActorSelections(
    authoringDb,
    {
      checkout: checkoutQuery.findMany(),
      purchase: purchaseQuery.findMany(),
      user: userQuery.findMany(),
      cartPromotion: promotionQuery.findMany(),
    },
    Schema.Struct({}),
  );
  const checkouts = (db: IMachineDb<ISource>) =>
    Schema.decodeUnknownSync(Schema.Array(Checkout))(
      db.query.checkout?.findMany().sync(),
    );
  const next = (
    db: IMachineDb<ISource>,
    handled: readonly string[],
    aggregateId: string,
  ) => {
    const existing = new Set(
      Schema.decodeUnknownSync(Schema.Array(Purchase))(
        db.query.purchase?.findMany().sync(),
      ).map(row => row.id),
    );
    const promotions = new Map(
      Schema.decodeUnknownSync(Schema.Array(Promotion))(
        db.query.cartPromotion?.findMany().sync(),
      ).map(row => [row.id, row]),
    );
    const checkout = checkouts(db).find(
      row =>
        row.status === 'accepted' &&
        row.purchaseId !== null &&
        row.firstPaymentIntentId !== null &&
        row.quote !== null &&
        (row.promotionReservationId === null ||
          (promotions.get(row.promotionReservationId)?.status === 'committed' &&
            promotions.get(row.promotionReservationId)?.purchaseId ===
              row.purchaseId)) &&
        !existing.has(row.purchaseId) &&
        !handled.includes(row.id),
    );
    if (
      checkout === undefined ||
      checkout.purchaseId === null ||
      checkout.firstPaymentIntentId === null ||
      checkout.quote === null
    ) {
      return undefined;
    }
    return Creating.make({
      handled: [...handled],
      checkoutId: checkout.id,
      aggregateId,
      purchaseId: checkout.purchaseId,
      paymentIntentId: checkout.firstPaymentIntentId,
      cartId: checkout.cartId,
      quote: checkout.quote,
      claims: claimsForUser({ db, userId: checkout.userId }),
    });
  };
  return makeMachine({
    source,
    selections,
    contracts: {
      createAcceptedPurchase: {
        contract: source.contracts.createAcceptedPurchase,
        target: source,
      },
    },
    states: { idle: Idle, creating: Creating },
    onBootstrap: ({ db }) =>
      Idle.make({ handled: checkouts(db).map(row => row.id) }),
    routes: {
      idle: {
        onCommand: ({ origin, db, command }) =>
          'aggregateId' in command
            ? next(db, origin.handled, command.aggregateId)
            : undefined,
      },
      creating: {
        onCommand: () => undefined,
        command: ({ origin }) =>
          execute({
            binding: 'createAcceptedPurchase',
            aggregateId: origin.aggregateId,
            claims: origin.claims,
            payload: {
              checkoutId: origin.checkoutId,
              id: origin.purchaseId,
              paymentIntentId: origin.paymentIntentId,
              cartId: origin.cartId,
              quote: origin.quote,
              expectedExisting: false,
            },
          }),
        onResult: ({ origin, db }) => {
          const handled = [...origin.handled, origin.checkoutId];
          return (
            next(db, handled, origin.aggregateId) ?? Idle.make({ handled })
          );
        },
      },
    },
  });
}
