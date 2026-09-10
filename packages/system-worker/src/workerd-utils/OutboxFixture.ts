import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { DurableObject } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { Effect } from 'effect';

import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import {
  makeOutboxQueue,
  type IOutboxRepo,
} from '../makeOutboxQueue/makeOutboxQueue.js';
import {
  makeOutboxSubscriber,
  type IOutboxSubscriberRepo,
} from '../makeOutboxSubscriber/makeOutboxSubscriber.js';

const dbConfig = makeDbConfig({
  tables: {
    output: makeTable({
      name: 'output',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        deliveredAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.text({ nullable: true }),
        payload: primitives.text(),
      },
    }),
  },
});

// Transport-only fixtures intentionally keep their boundary methods inline.
export class OutboxReceiverFixture
  extends DurableObject
  implements IOutboxSubscriberRepo<OutboxSenderFixture['output']>
{
  readonly #db = drizzle(this.ctx.storage);
  readonly #ready = this.ctx.blockConcurrencyWhile(async () => {
    if (!this.ctx.storage.kv.get('ready')) {
      Effect.runSync(provisionDb({ db: this.#db, schema: dbConfig.schema }));
      this.ctx.storage.kv.put('ready', true);
    }
  });
  readonly #outputSubscriber = makeOutboxSubscriber({
    name: 'output',
    /*
     * Receives fixture outbox pages with idempotent row insertion and optional response loss.
     * The failure occurs after commit so tests can exercise delivery retries.
     *
     * 1. Persist the received page atomically.
     * 2. Reject conflicting repeated indices.
     * 3. Record the received page.
     * 4. Optionally lose the acknowledgement.
     */
    receive: Effect.fn('OutboxReceiverFixture.receive')(
      (rows: readonly (typeof dbConfig.schema.output.$inferSelect)[]) =>
        Effect.gen({ self: this }, function* () {
          // 1 — check and insert all rows together with the page-index observation
          this.ctx.storage.transactionSync(() => {
            // 2 — compare the existing payload before ignoring an identical outboxIndex
            for (const row of rows) {
              const existing = this.#db
                .select()
                .from(dbConfig.schema.output)
                .where(eq(dbConfig.schema.output.outboxIndex, row.outboxIndex))
                .get();
              if (existing !== undefined && existing.payload !== row.payload) {
                throw new Error('Conflicting output');
              }
              this.#db
                .insert(dbConfig.schema.output)
                .values(row)
                .onConflictDoNothing()
                .run();
            }

            // 3 — append its ordered outbox indices to fixture KV
            const pages = this.ctx.storage.kv.get<number[][]>('pages') ?? [];
            this.ctx.storage.kv.put('pages', [
              ...pages,
              rows.map(row => row.outboxIndex),
            ]);
          });

          // 4 — return response-lost after the transaction has already committed
          if (this.ctx.storage.kv.get('loseResponse')) {
            return yield* new ZerospinError({
              code: 'response-lost',
              message: 'Committed receiver page before response loss',
            });
          }
        }),
    ),
  });
  /*
   * Exposes the fixture receiver capability used by the bound sender outbox.
   *
   * 1. Return the receiver capability.
   */
  get outputSubscriber() {
    // 1 — reuse the subscriber instance bound to this object
    return this.#outputSubscriber;
  }
  /*
   * Controls the fixture failure injected after a receiver page commits.
   *
   * 1. Await schema initialization.
   * 2. Persist the response-loss switch.
   */
  async setResponseLoss(value: boolean) {
    // 1 — keep failure controls behind the receiver readiness gate
    await this.#ready;

    // 2 — apply the switch to subsequent receive calls
    this.ctx.storage.kv.put('loseResponse', value);
  }
  /*
   * Returns receiver storage observations for delivery and retry assertions.
   *
   * 1. Await schema initialization.
   * 2. Read the stored rows and page history.
   */
  async inspect() {
    // 1 — read only after the receiver tables exist
    await this.#ready;

    // 2 — report durable output rows and every committed receive page
    return {
      rows: this.#db.select().from(dbConfig.schema.output).all(),
      pages: this.ctx.storage.kv.get<number[][]>('pages') ?? [],
    };
  }
}

export class OutboxSenderFixture
  extends DurableObject<{
    OUTBOX_RECEIVER_FIXTURE: DurableObjectNamespace<OutboxReceiverFixture>;
  }>
  implements IOutboxRepo<'output'>
{
  readonly #db = drizzle(this.ctx.storage);
  readonly #ready = this.ctx.blockConcurrencyWhile(async () => {
    if (!this.ctx.storage.kv.get('ready')) {
      Effect.runSync(provisionDb({ db: this.#db, schema: dbConfig.schema }));
      this.ctx.storage.kv.put('ready', true);
    }
  });
  readonly #alarmRegistry = makeAlarmRegistry({ storage: this.ctx.storage });
  readonly #output = makeOutboxQueue({
    name: 'output',
    db: this.#db,
    outboxTable: dbConfig.schema.output,
    retention: 'delete',
    alarmRegistry: this.#alarmRegistry,
    deliver: rows =>
      makeAsync(async () => {
        const receiver = await this.env.OUTBOX_RECEIVER_FIXTURE.getByName(
          this.ctx.id.toString(),
        ).outputSubscriber;
        return receiver.receive(rows);
      }).pipe(Effect.flatMap(decodeRpc)),
  });
  /*
   * Exposes the sender outbox so fixture tests can exercise its local drain behavior.
   *
   * 1. Return the bound outbox.
   */
  get output() {
    // 1 — reuse the queue configured with delete retention and its fixed receiver
    return this.#output;
  }
  /*
   * Populates fixture outbox rows for ordered delivery tests.
   *
   * 1. Await schema initialization.
   * 2. Insert one ordered batch.
   */
  async seed(count: number) {
    // 1 — wait for the sender output table
    await this.#ready;

    // 2 — write payload-N rows at indices 1 through count atomically
    this.ctx.storage.transactionSync(() => {
      for (let outboxIndex = 1; outboxIndex <= count; outboxIndex++) {
        this.#db
          .insert(dbConfig.schema.output)
          .values({ outboxIndex, payload: `payload-${outboxIndex}` })
          .run();
      }
    });
  }
  /*
   * Runs an explicit fixture delivery attempt and exposes its success or failure tag.
   *
   * 1. Run the outbox drain.
   */
  async drain() {
    // 1 — provide AsyncLive and convert the drain result into its Result tag
    return Effect.runPromise(
      this.#output.drain().pipe(Effect.result, Effect.provide(AsyncLive)),
    ).then(result => result._tag);
  }
  /*
   * Retries fixture outbox delivery through the Durable Object alarm boundary.
   *
   * 1. Run the alarm delivery attempt.
   */
  override async alarm() {
    // 1 — dispatch the outbox registered during construction and propagate failure
    await Effect.runPromise(
      this.#alarmRegistry.run().pipe(Effect.provide(AsyncLive)),
    );
  }
  /*
   * Returns pending sender rows and the scheduled alarm for retry assertions.
   *
   * 1. Await schema initialization.
   * 2. Read rows and alarm state.
   */
  async inspect() {
    // 1 — wait for the sender output table
    await this.#ready;

    // 2 — inspect pending output alongside the durable retry alarm
    return {
      rows: this.#db.select().from(dbConfig.schema.output).all(),
      alarm: await this.ctx.storage.getAlarm(),
    };
  }
}

declare global {
  namespace Cloudflare {
    interface Env {
      OUTBOX_SENDER_FIXTURE: DurableObjectNamespace<OutboxSenderFixture>;
      OUTBOX_RECEIVER_FIXTURE: DurableObjectNamespace<OutboxReceiverFixture>;
    }
  }
}
