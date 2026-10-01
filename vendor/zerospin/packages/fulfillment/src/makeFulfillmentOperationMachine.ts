import type { IAnyAuthoredAggregate } from '@zerospin/core/aggregate/types';
import type { IContract } from '@zerospin/core/contracts/types';
import {
  execute,
  makeMachine,
} from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import type { IMachineDb } from '@zerospin/core/machine/types';
import { Model } from '@zerospin/core/models/defineModel';
import {
  captureActorSelections,
  makeActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import type { IModel } from '@zerospin/core/models/types';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { FulfillmentClient } from './FulfillmentClient.js';

type ISource = IAnyAuthoredAggregate & {
  models: { fulfillment: IModel; fulfillmentOperation: IModel; user: IModel };
  contracts: { recordFulfillmentOperation: IContract };
};
const Fulfillment = Schema.Struct({
  id: makeAbbreviationIdSchema('ful'),
  requestId: Schema.String,
  purchaseId: Schema.String,
  userId: Schema.String,
  aggregateId: Schema.String,
});
const Operation = Schema.Struct({
  id: makeAbbreviationIdSchema('fop'),
  fulfillmentId: makeAbbreviationIdSchema('ful'),
  action: Schema.Literals(['pack', 'ship']),
  status: Schema.String,
});
const Fields = {
  handled: Schema.Array(Schema.String),
  operationId: makeAbbreviationIdSchema('fop'),
  fulfillmentId: makeAbbreviationIdSchema('ful'),
  action: Schema.Literals(['pack', 'ship']),
  requestId: Schema.String,
  purchaseId: Schema.String,
  userId: Schema.String,
  aggregateId: Schema.String,
  claims: Schema.Record(Schema.String, Schema.Unknown),
};
const Idle = makeState({
  stateName: 'idle',
  input: { handled: Schema.Array(Schema.String) },
});
const Operating = makeState({ stateName: 'operating', input: Fields });

/** Executes each new packing or shipping request and records its terminal observation. */
export function makeFulfillmentOperationMachine(props: {
  source: ISource;
  serviceVersion: string;
  claimsForUser: (props: {
    db: IMachineDb<ISource>;
    userId: string;
  }) => Readonly<Record<string, unknown>>;
}) {
  const { source, serviceVersion, claimsForUser } = props;
  const fulfillmentModel = source.models.fulfillment;
  if (!Model.isReplica(fulfillmentModel)) {
    throw new Error('Fulfillment operation requires a service replica');
  }
  const Reporting = makeState({
    stateName: 'reporting',
    input: {
      ...Fields,
      status: Schema.Literals(['succeeded', 'failed']),
      failure: Schema.NullOr(Schema.String),
      fulfillment: Schema.NullOr(fulfillmentModel.sourceModel.resourceSchema),
    },
  });
  const authoringDb = makeActorDbVersion({ models: source.models });
  const fulfillmentQuery = authoringDb.query.fulfillment;
  const operationQuery = authoringDb.query.fulfillmentOperation;
  const userQuery = authoringDb.query.user;
  if (
    fulfillmentQuery === undefined ||
    operationQuery === undefined ||
    userQuery === undefined
  ) {
    throw new Error('Fulfillment operation source models are missing');
  }
  const selections = captureActorSelections(
    authoringDb,
    {
      fulfillment: fulfillmentQuery.findMany(),
      fulfillmentOperation: operationQuery.findMany(),
      user: userQuery.findMany(),
    },
    Schema.Struct({}),
  );
  const operations = (db: IMachineDb<ISource>) =>
    Schema.decodeUnknownSync(Schema.Array(Operation))(
      db.query.fulfillmentOperation?.findMany().sync(),
    );
  const next = (db: IMachineDb<ISource>, handled: readonly string[]) => {
    const rows = new Map(
      Schema.decodeUnknownSync(Schema.Array(Fulfillment))(
        db.query.fulfillment?.findMany().sync(),
      ).map(row => [row.id, row]),
    );
    const operation = operations(db).find(
      row =>
        row.status === 'requested' &&
        !handled.includes(row.id) &&
        rows.has(row.fulfillmentId),
    );
    if (operation === undefined) return undefined;
    const fulfillment = rows.get(operation.fulfillmentId);
    if (fulfillment === undefined) return undefined;
    return Operating.make({
      handled: [...handled],
      operationId: operation.id,
      fulfillmentId: operation.fulfillmentId,
      action: operation.action,
      requestId: fulfillment.requestId,
      purchaseId: fulfillment.purchaseId,
      userId: fulfillment.userId,
      aggregateId: fulfillment.aggregateId,
      claims: claimsForUser({ db, userId: fulfillment.userId }),
    });
  };
  return makeMachine({
    source,
    selections,
    contracts: {
      recordFulfillmentOperation: {
        contract: source.contracts.recordFulfillmentOperation,
        target: source,
      },
    },
    states: { idle: Idle, operating: Operating, reporting: Reporting },
    onBootstrap: ({ db }) =>
      Idle.make({
        handled: operations(db)
          .filter(row => row.status === 'requested')
          .map(row => row.id),
      }),
    routes: {
      idle: { onCommand: ({ origin, db }) => next(db, origin.handled) },
      operating: {
        onCommand: () => undefined,
        onActivation: ({ origin }) =>
          Effect.gen(function* () {
            const client = yield* FulfillmentClient;
            const result = yield* client.operate({
              serviceVersion,
              operationId: origin.operationId,
              fulfillmentId: origin.fulfillmentId,
              action: origin.action,
              requestId: origin.requestId,
              purchaseId: origin.purchaseId,
              userId: origin.userId,
              aggregateId: origin.aggregateId,
            });
            return Reporting.make({
              handled: origin.handled,
              operationId: origin.operationId,
              fulfillmentId: origin.fulfillmentId,
              action: origin.action,
              requestId: origin.requestId,
              purchaseId: origin.purchaseId,
              userId: origin.userId,
              aggregateId: origin.aggregateId,
              claims: origin.claims,
              status: result.kind === 'confirmed' ? 'succeeded' : 'failed',
              failure: result.kind === 'rejected' ? result.reason : null,
              fulfillment:
                result.kind === 'confirmed' ? result.fulfillment : null,
            });
          }),
      },
      reporting: {
        onCommand: () => undefined,
        command: ({ origin }) =>
          execute({
            binding: 'recordFulfillmentOperation',
            aggregateId: origin.aggregateId,
            claims: origin.claims,
            payload: {
              id: origin.operationId,
              fulfillmentId: origin.fulfillmentId,
              action: origin.action,
              status: origin.status,
              failure: origin.failure,
              fulfillment: origin.fulfillment,
            },
          }),
        onResult: ({ origin, db }) => {
          const handled = [...origin.handled, origin.operationId];
          return next(db, handled) ?? Idle.make({ handled });
        },
      },
    },
  });
}
