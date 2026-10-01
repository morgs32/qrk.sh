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
import { Effect, Schema } from 'effect';

import { PaymentProvider } from './providers.js';
import { PurchaseQuoteSchema } from './quote.js';

type ISource = IAnyAuthoredAggregate & {
  models: { checkout: IModel; paymentIntent: IModel };
  contracts: { recordPaymentObservation: IContract };
};
const Checkout = Schema.Struct({
  id: makeAbbreviationIdSchema('chk'),
  userId: makeAbbreviationIdSchema('usr'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  quote: Schema.NullOr(Schema.fromJsonString(PurchaseQuoteSchema)),
});
const Intent = Schema.Struct({
  id: makeAbbreviationIdSchema('pmt'),
  purchaseId: makeAbbreviationIdSchema('pur'),
  status: Schema.String,
});
const Fields = {
  handled: Schema.Array(Schema.String),
  aggregateId: Schema.String,
  checkoutId: makeAbbreviationIdSchema('chk'),
  purchaseId: makeAbbreviationIdSchema('pur'),
  paymentIntentId: makeAbbreviationIdSchema('pmt'),
  quote: PurchaseQuoteSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
};
const Idle = makeState({
  stateName: 'idle',
  input: { handled: Schema.Array(Schema.String) },
});
const Paying = makeState({ stateName: 'paying', input: Fields });
const Reporting = makeState({
  stateName: 'reporting',
  input: {
    ...Fields,
    outcome: Schema.Literals(['succeeded', 'declined', 'uncertain']),
    providerReference: Schema.String,
  },
});

/** One payment attempt is frozen before its provider call and recorded once. */
export function makePurchasePaymentMachine(props: {
  source: ISource;
  claimsForUser: (props: {
    db: IMachineDb<ISource>;
    userId: string;
  }) => Readonly<Record<string, unknown>>;
}) {
  const { source, claimsForUser } = props;
  const authoringDb = makeActorDbVersion({ models: source.models });
  const checkoutQuery = authoringDb.query.checkout;
  const intentQuery = authoringDb.query.paymentIntent;
  if (checkoutQuery === undefined || intentQuery === undefined) {
    throw new Error('Purchase payment source models are missing');
  }
  const selections = captureActorSelections(
    authoringDb,
    {
      checkout: checkoutQuery.findMany(),
      paymentIntent: intentQuery.findMany(),
    },
    Schema.Struct({}),
  );
  const intents = (db: IMachineDb<ISource>) =>
    Schema.decodeUnknownSync(Schema.Array(Intent))(
      db.query.paymentIntent?.findMany().sync(),
    );
  const next = (
    db: IMachineDb<ISource>,
    handled: readonly string[],
    aggregateId: string,
  ) => {
    const checkouts = Schema.decodeUnknownSync(Schema.Array(Checkout))(
      db.query.checkout?.findMany().sync(),
    );
    const intent = intents(db).find(
      row => row.status === 'pending' && !handled.includes(row.id),
    );
    if (intent === undefined) return undefined;
    const checkout = checkouts.find(
      row => row.purchaseId === intent.purchaseId && row.quote !== null,
    );
    if (checkout === undefined || checkout.quote === null) return undefined;
    return Paying.make({
      handled: [...handled],
      aggregateId,
      checkoutId: checkout.id,
      purchaseId: intent.purchaseId,
      paymentIntentId: intent.id,
      quote: checkout.quote,
      claims: claimsForUser({ db, userId: checkout.userId }),
    });
  };
  return makeMachine({
    source,
    selections,
    contracts: {
      recordPaymentObservation: {
        contract: source.contracts.recordPaymentObservation,
        target: source,
      },
    },
    states: { idle: Idle, paying: Paying, reporting: Reporting },
    onBootstrap: ({ db }) =>
      Idle.make({ handled: intents(db).map(row => row.id) }),
    routes: {
      idle: {
        onCommand: ({ origin, db, command }) =>
          'aggregateId' in command
            ? next(db, origin.handled, command.aggregateId)
            : undefined,
      },
      paying: {
        onCommand: () => undefined,
        onActivation: ({ origin }) =>
          Effect.gen(function* () {
            const pay = yield* PaymentProvider;
            const observation = yield* pay({
              paymentIntentId: origin.paymentIntentId,
              purchaseId: origin.purchaseId,
              quote: origin.quote,
            });
            return Reporting.make({
              handled: origin.handled,
              aggregateId: origin.aggregateId,
              checkoutId: origin.checkoutId,
              purchaseId: origin.purchaseId,
              paymentIntentId: origin.paymentIntentId,
              quote: origin.quote,
              claims: origin.claims,
              ...observation,
            });
          }),
      },
      reporting: {
        onCommand: () => undefined,
        command: ({ origin }) =>
          execute({
            binding: 'recordPaymentObservation',
            aggregateId: origin.aggregateId,
            claims: origin.claims,
            payload: {
              checkoutId: origin.checkoutId,
              purchaseId: origin.purchaseId,
              paymentIntentId: origin.paymentIntentId,
              expected: 'pending',
              outcome: origin.outcome,
              providerReference: origin.providerReference,
              cartItemIds: origin.quote.items.map(item => item.cartItemId),
            },
          }),
        onResult: ({ origin, db }) => {
          const handled = [...origin.handled, origin.paymentIntentId];
          return (
            next(db, handled, origin.aggregateId) ?? Idle.make({ handled })
          );
        },
      },
    },
  });
}
