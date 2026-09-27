import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeTable, primitives } from '@zerospin/schema';

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

/**
 * Define named synchronous transaction programs with makeTx(name, options?)(generator).
 * Pass db at invocation; the generator receives a schema-specific tx as its first argument.
 *
 * @bad Creating Db/Tx Context services solely to pass handles into makeTx.
 * @bad Wrapping the generator in another Effect.fn or Effect.gen at the call site.
 * @bad Replacing explicit transaction arguments with a shared ambient transaction tag.
 * @good Receive tx directly, perform synchronous Drizzle operations inline, and pass tx to helpers.
 * @good Run async preparation before the transaction; keep commit-time invariants inside it.
 */
export const applySubscriberBatch = makeTx('Subscriber.applyBatch')(function* (
  tx: ITx<typeof subscriberDbConfig>,
  events: readonly { cursor: number; payload: string }[],
) {
  for (const event of events) {
    tx.insert(subscriberDbConfig.schema.events).values(event).run();
  }
});

declare const db: IDb<typeof subscriberDbConfig>;
export const application = applySubscriberBatch(db, [
  { cursor: 1, payload: 'event' },
]);
