import type { IContract } from '@zerospin/core/contracts/types';
import { captureActorSelections, makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import type { IModel } from '@zerospin/core/models/types';
import type { IService } from '@zerospin/core/service/types';
import { execute, makeMachine } from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import type { IMachineDb } from '@zerospin/core/machine/types';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { Carrier } from './Carrier.js';

const Idle = makeState({ stateName: 'idle', input: {} });
const Preparing = makeState({
  stateName: 'preparing',
  input: {
    fulfillmentId: makeAbbreviationIdSchema('ful'),
    warehouseCode: Schema.NullOr(Schema.String),
  },
});
const Sending = makeState({
  stateName: 'sending',
  input: {
    fulfillmentId: makeAbbreviationIdSchema('ful'),
    trackingId: Schema.String,
  },
});
const FulfillmentRow = Schema.Struct({
  id: makeAbbreviationIdSchema('ful'),
  status: Schema.String,
  warehouseCode: Schema.optionalKey(Schema.String),
});

type IShippingSource = IService<
  string,
  { fulfillment: IModel },
  { markPacked: IContract; markShipped: IContract }
>;

/** One service owner ships the next selected packed fulfillment after each result. */
export function makeFulfillmentShippingMachine(
  source: IShippingSource,
) {
  const selectedDb = makeActorDbVersion({ models: { fulfillment: source.models.fulfillment } });
  const selections = captureActorSelections(
    selectedDb,
    { fulfillment: selectedDb.query.fulfillment.findMany() },
    Schema.Struct({}),
  );
  const nextPacked = (db: IMachineDb<IShippingSource>, excludeId?: string) => {
    const rows = Schema.decodeUnknownSync(Schema.Array(FulfillmentRow))(
      db.query.fulfillment.findMany().sync(),
    );
    const row = rows.find(candidate => candidate.status === 'packed' && candidate.id !== excludeId);
    return row === undefined
      ? undefined
      : Preparing.make({
          fulfillmentId: row.id,
          warehouseCode: row.warehouseCode ?? null,
        });
  };
  return makeMachine({
    source,
    selections,
    contracts: { markShipped: { contract: source.contracts.markShipped, target: source } },
    states: { idle: Idle, preparing: Preparing, sending: Sending },
    onBootstrap: ({ db }) => nextPacked(db) ?? Idle.make({}),
    routes: {
      idle: {
        onCommand: ({ db }) => nextPacked(db),
      },
      preparing: {
        onCommand: ({ origin, db }) => {
          const rows = Schema.decodeUnknownSync(Schema.Array(FulfillmentRow))(
            db.query.fulfillment.findMany().sync(),
          );
          return rows.some(row => row.id === origin.fulfillmentId && row.status === 'packed')
            ? undefined
            : Idle.make({});
        },
        onActivation: ({ origin }) => Effect.gen(function* () {
          const carrier = yield* Carrier;
          const trackingId = yield* carrier({
            id: origin.fulfillmentId,
            ...(origin.warehouseCode === null ? {} : { warehouseCode: origin.warehouseCode }),
          });
          return Sending.make({ fulfillmentId: origin.fulfillmentId, trackingId });
        }),
      },
      sending: {
        command: ({ origin }) => execute({
          binding: 'markShipped',
          payload: {
            fulfillmentId: origin.fulfillmentId,
            trackingId: origin.trackingId,
          },
        }),
        onResult: ({ origin, db }) => nextPacked(db, origin.fulfillmentId) ?? Idle.make({}),
      },
    },
  });
}
