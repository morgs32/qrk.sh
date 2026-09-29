import type { IAnyAuthoredAggregate } from '@zerospin/core/aggregate/types';
import type { IContract } from '@zerospin/core/contracts/types';
import { Model } from '@zerospin/core/models/defineModel';
import { captureActorSelections, makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import type { IModel } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import { execute, makeMachine } from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import type { IMachineDb } from '@zerospin/core/machine/types';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { FulfillmentClient } from './FulfillmentClient.js';

type ISource = IAnyAuthoredAggregate & {
  models: { checkout: IModel; purchase: IModel; fulfillment: IModel; user: IModel };
  contracts: { enrollFulfillment: IContract };
};
const Checkout = Schema.Struct({
  id: makeAbbreviationIdSchema('chk'),
  userId: makeAbbreviationIdSchema('usr'),
  purchaseId: Schema.NullOr(makeAbbreviationIdSchema('pur')),
  status: Schema.String,
});
const Fulfillment = Schema.Struct({ requestId: Schema.String });
const Fields = {
  handled: Schema.Array(Schema.String),
  aggregateId: Schema.String,
  checkoutId: makeAbbreviationIdSchema('chk'),
  purchaseId: makeAbbreviationIdSchema('pur'),
  userId: makeAbbreviationIdSchema('usr'),
  claims: Schema.Record(Schema.String, Schema.Unknown),
};
const Idle = makeState({ stateName: 'idle', input: { handled: Schema.Array(Schema.String) } });
const Requesting = makeState({ stateName: 'requesting', input: Fields });

/** Requests one fulfillment per newly paid purchase and retains its enrollment command. */
export function makePaidFulfillmentMachine(props: {
  source: ISource;
  serviceVersion: string;
  claimsForUser: (props: { db: IMachineDb<ISource>; userId: string }) => Readonly<Record<string, unknown>>;
}) {
  const { source, serviceVersion, claimsForUser } = props;
  const fulfillmentModel = source.models.fulfillment;
  if (!Model.isReplica(fulfillmentModel)) {
    throw new Error('Paid fulfillment requires a service replica');
  }
  const Enrolling = makeState({
    stateName: 'enrolling',
    input: { ...Fields, fulfillment: fulfillmentModel.sourceModel.resourceSchema },
  });
  const authoringDb = makeActorDbVersion({ models: source.models });
  const checkoutQuery = authoringDb.query.checkout;
  const fulfillmentQuery = authoringDb.query.fulfillment;
  const userQuery = authoringDb.query.user;
  if (checkoutQuery === undefined || fulfillmentQuery === undefined || userQuery === undefined) {
    throw new Error('Paid fulfillment source models are missing');
  }
  const selections = captureActorSelections(authoringDb, {
    checkout: checkoutQuery.findMany(),
    fulfillment: fulfillmentQuery.findMany(),
    user: userQuery.findMany(),
  }, Schema.Struct({}));
  const checkouts = (db: IMachineDb<ISource>) => Schema.decodeUnknownSync(Schema.Array(Checkout))(
    db.query.checkout?.findMany().sync(),
  );
  const next = (db: IMachineDb<ISource>, handled: readonly string[], aggregateId: string) => {
    const fulfilled = new Set(Schema.decodeUnknownSync(Schema.Array(Fulfillment))(
      db.query.fulfillment?.findMany().sync(),
    ).map(row => row.requestId));
    const checkout = checkouts(db).find(row =>
      row.status === 'paid' && row.purchaseId !== null &&
      !handled.includes(row.purchaseId) &&
      !fulfilled.has(`purchase:${row.purchaseId}`));
    if (checkout === undefined || checkout.purchaseId === null) return undefined;
    return Requesting.make({
      handled: [...handled],
      aggregateId,
      checkoutId: checkout.id,
      purchaseId: checkout.purchaseId,
      userId: checkout.userId,
      claims: claimsForUser({ db, userId: checkout.userId }),
    });
  };
  return makeMachine({
    source,
    selections,
    contracts: {
      enrollFulfillment: { contract: source.contracts.enrollFulfillment, target: source },
    },
    states: { idle: Idle, requesting: Requesting, enrolling: Enrolling },
    onBootstrap: ({ db }) => Idle.make({
      handled: checkouts(db).flatMap(row => row.status === 'paid' && row.purchaseId !== null
        ? [row.purchaseId] : []),
    }),
    routes: {
      idle: {
        onCommand: ({ origin, db, command }) =>
          'aggregateId' in command ? next(db, origin.handled, command.aggregateId) : undefined,
      },
      requesting: {
        onCommand: () => undefined,
        onActivation: ({ origin }) => Effect.gen(function* () {
          const client = yield* FulfillmentClient;
          const result = yield* client.request({
            serviceVersion,
            requestId: `purchase:${origin.purchaseId}`,
            purchaseId: origin.purchaseId,
            userId: origin.userId,
            aggregateId: origin.aggregateId,
          });
          if (result.kind === 'rejected') {
            return yield* makeZerospinError({
              code: 'fulfillment-request-rejected', message: result.reason,
            });
          }
          return Enrolling.make({
            handled: origin.handled,
            aggregateId: origin.aggregateId,
            checkoutId: origin.checkoutId,
            purchaseId: origin.purchaseId,
            userId: origin.userId,
            claims: origin.claims,
            fulfillment: result.fulfillment,
          });
        }),
      },
      enrolling: {
        onCommand: () => undefined,
        command: ({ origin }) => execute({
          binding: 'enrollFulfillment',
          aggregateId: origin.aggregateId,
          claims: origin.claims,
          payload: { fulfillment: origin.fulfillment },
        }),
        onResult: ({ origin, db }) => {
          const handled = [...origin.handled, origin.purchaseId];
          return next(db, handled, origin.aggregateId) ?? Idle.make({ handled });
        },
      },
    },
  });
}
