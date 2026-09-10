import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeTable, primitives } from '@zerospin/schema';
import { Context, Effect } from 'effect';

const subscriberDbConfig = makeDbConfig({
  tables: {
    events: makeTable({
      name: 'events',
      shape: {
        cursor: primitives.integer({ primaryKey: true }),
        payload: primitives.text(),
      },
    }),
  },
});

class SubscriberDb extends Context.Service<
  SubscriberDb,
  IDb<typeof subscriberDbConfig>
>()('SubscriberDb') {
  static readonly Tx = Context.Service<
    'SubscriberDb.Tx',
    ITx<typeof subscriberDbConfig>
  >('SubscriberDb.Tx');
}

/**
 * Define named synchronous transaction programs with makeTx(name, Db)(generator).
 * Db owns a distinct, schema-specific Tx service; only makeTx provides the open transaction.
 *
 * @bad Passing database handles and transaction callbacks in a makeTx props object.
 * @bad Wrapping the generator in another Effect.fn or Effect.gen at the call site.
 * @bad Using the transaction value type as its service identifier; same-schema owners must remain distinct.
 * @good Yield Db.Tx, perform synchronous Drizzle operations inline, and provide Db at invocation.
 * @good Run async preparation before the transaction; keep commit-time invariants inside it.
 */
export const applySubscriberBatch = makeTx(
  'Subscriber.applyBatch',
  SubscriberDb,
)(function* (events: readonly { cursor: number; payload: string }[]) {
  const tx = yield* SubscriberDb.Tx;
  for (const event of events) {
    tx.insert(subscriberDbConfig.schema.events).values(event).run();
  }
});

declare const db: IDb<typeof subscriberDbConfig>;
export const application = applySubscriberBatch([
  { cursor: 1, payload: 'event' },
]).pipe(Effect.provideService(SubscriberDb, db));
