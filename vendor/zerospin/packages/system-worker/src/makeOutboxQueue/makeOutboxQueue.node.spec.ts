import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeInMemorySqlJsDatabase } from '@zerospin/core/drizzle/makeInMemorySqlJsDatabase';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { drizzle } from 'drizzle-orm/sql-js';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeOutboxSubscriber } from '../makeOutboxSubscriber/makeOutboxSubscriber.js';

import { makeOutboxQueue } from './makeOutboxQueue.js';

const dbConfig = makeDbConfig({
  tables: {
    other: makeTable({
      name: 'other',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        deliveredAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.text({ nullable: true }),
        payload: primitives.text(),
      },
    }),
    outbox: makeTable({
      name: 'outbox',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        deliveredAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.text({ nullable: true }),
        payload: primitives.text(),
      },
    }),
  },
});

describe('table-driven outbox', () => {
  it('publishes only the requested checkpoint and preserves the alarm for later rows', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    db.insert(dbConfig.schema.outbox)
      .values(
        [1, 2, 3].map(outboxIndex => ({
          outboxIndex,
          payload: String(outboxIndex),
        })),
      )
      .run();
    const delivered: number[] = [];
    const deleteAlarm = vi.fn(async () => undefined);
    const registry = makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    });
    const queue = makeOutboxQueue({
      name: 'bounded',
      db,
      outboxTable: dbConfig.schema.outbox,
      retention: 'delete',
      alarmRegistry: registry,
      deliver: rows =>
        Effect.sync(() => {
          delivered.push(...rows.map(row => row.outboxIndex));
        }),
    });
    await Effect.runPromise(queue.drain(2).pipe(Effect.provide(AsyncLive)));
    expect(delivered).toEqual([1, 2]);
    expect(deleteAlarm).not.toHaveBeenCalled();
    expect(
      db
        .select()
        .from(dbConfig.schema.outbox)
        .all()
        .map(row => row.outboxIndex),
    ).toEqual([3]);
    await Effect.runPromise(registry.run().pipe(Effect.provide(AsyncLive)));
    expect(delivered).toEqual([1, 2, 3]);
    expect(deleteAlarm).toHaveBeenCalled();
  });

  it.each<'retain' | 'delete'>(['retain', 'delete'])(
    'serializes pages and acknowledges exact in-flight rows (%s)',
    async retention => {
      const client = await makeInMemorySqlJsDatabase();
      const queries: { query: string; params: unknown[] }[] = [];
      const db = drizzle(client, {
        logger: {
          logQuery: (query, params) => {
            queries.push({ query, params });
          },
        },
      });
      Effect.runSync(provisionDb({ db, schema: dbConfig.schema }));
      for (let outboxIndex = 1; outboxIndex <= 130; outboxIndex++) {
        db.insert(dbConfig.schema.outbox)
          .values({ outboxIndex, payload: `payload-${outboxIndex}` })
          .run();
      }
      const delivered: number[][] = [];
      const entered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      const setAlarm = vi.fn(async () => undefined);
      const deleteAlarm = vi.fn(async () => undefined);
      const queue = makeOutboxQueue({
        name: 'output',
        db,
        outboxTable: dbConfig.schema.outbox,
        alarmRegistry: makeAlarmRegistry({
          storage: { setAlarm, deleteAlarm },
        }),
        retention,
        deliver: rows =>
          Effect.gen(function* () {
            delivered.push(rows.map(row => row.outboxIndex));
            expect(rows[0]?.payload).toBe(`payload-${rows[0]?.outboxIndex}`);
            if (delivered.length === 1) {
              entered.resolve();
              yield* Effect.promise(() => resume.promise);
            }
          }),
      });
      const drains = Effect.runPromise(
        Effect.all([queue.drain(), queue.drain()], {
          concurrency: 'unbounded',
        }).pipe(Effect.provide(AsyncLive)),
      );
      await entered.promise;
      db.insert(dbConfig.schema.outbox)
        .values({ outboxIndex: 131, payload: 'payload-131' })
        .run();
      expect(
        db
          .select()
          .from(dbConfig.schema.outbox)
          .all()
          .every(row => row.deliveredAt === null),
      ).toBe(true);
      resume.resolve();
      await drains;
      const reads = queries.filter(
        entry =>
          entry.query.startsWith('select') &&
          entry.query.includes('where') &&
          entry.params.at(-1) !== 1,
      );
      expect(reads.length).toBeGreaterThan(0);
      expect(
        reads.every(
          entry =>
            entry.query.includes('limit ?') && entry.params.at(-1) === 64,
        ),
      ).toBe(true);
      expect(delivered.map(page => page.length)).toEqual([64, 64, 3]);
      expect(delivered.flat()).toEqual(
        Array.from({ length: 131 }, (_, index) => index + 1),
      );
      const retained = db.select().from(dbConfig.schema.outbox).all();
      expect(retained).toHaveLength(retention === 'retain' ? 131 : 0);
      expect(
        retained.every(
          row =>
            row.deliveredAt instanceof Date && row.lastDeliveryFailure === null,
        ),
      ).toBe(true);
      expect(await Effect.runPromise(queue.hasPending())).toBe(false);
      expect(queries.at(-1)?.params.at(-1)).toBe(1);
      client.close();
    },
  );

  it('retries a committed page after lost responses, preserving order and other alarm leases', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    for (let outboxIndex = 1; outboxIndex <= 65; outboxIndex++) {
      db.insert(dbConfig.schema.outbox)
        .values({ outboxIndex, payload: `${outboxIndex}` })
        .run();
    }
    const committed = new Set<number>();
    const pages: number[][] = [];
    let loseResponse = true;
    const subscriber = makeOutboxSubscriber({
      name: 'output',
      receive: (
        rows: readonly (typeof dbConfig.schema.outbox.$inferSelect)[],
      ) =>
        Effect.sync(() => {
          for (const row of rows) committed.add(row.outboxIndex);
        }),
    });
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const alarmRegistry = makeAlarmRegistry({
      storage: { setAlarm, deleteAlarm },
    });
    db.insert(dbConfig.schema.other)
      .values({ outboxIndex: 1, payload: 'independent' })
      .run();
    let otherFails = true;
    const other = makeOutboxQueue({
      name: 'other',
      db,
      outboxTable: dbConfig.schema.other,
      alarmRegistry,
      retention: 'retain',
      deliver: () =>
        otherFails
          ? Effect.fail(
              new ZerospinError({
                code: 'other-pending',
                message: 'Other receiver unavailable',
              }),
            )
          : Effect.void,
    });
    await Effect.runPromise(
      other.drain().pipe(Effect.result, Effect.provide(AsyncLive)),
    );
    const queue = makeOutboxQueue({
      name: 'output',
      db,
      outboxTable: dbConfig.schema.outbox,
      alarmRegistry,
      retention: 'delete',
      deliver: rows =>
        Effect.gen(function* () {
          pages.push(rows.map(row => row.outboxIndex));
          yield* makeAsync(() => subscriber.receive(rows)).pipe(
            Effect.flatMap(decodeRpc),
          );
          if (loseResponse) {
            return yield* new ZerospinError({
              code: 'response-lost',
              message: 'Receiver committed; response lost',
            });
          }
        }),
    });
    const failed = await Effect.runPromise(
      queue.drain().pipe(Effect.result, Effect.provide(AsyncLive)),
    );
    expect(failed._tag).toBe('Failure');
    expect(pages.map(page => page.length)).toEqual([64, 64, 64]);
    expect(committed.size).toBe(64);
    expect(
      db.select().from(dbConfig.schema.outbox).get()?.lastDeliveryFailure,
    ).toBe('response-lost: Receiver committed; response lost');
    expect(deleteAlarm).not.toHaveBeenCalled();
    loseResponse = false;
    await Effect.runPromise(queue.drain().pipe(Effect.provide(AsyncLive)));
    expect(pages.at(-2)).toEqual(pages[0]);
    expect(pages.at(-1)).toEqual([65]);
    expect(committed.size).toBe(65);
    expect(deleteAlarm).not.toHaveBeenCalled();
    expect(setAlarm).toHaveBeenCalledTimes(3);
    otherFails = false;
    await Effect.runPromise(other.drain().pipe(Effect.provide(AsyncLive)));
    expect(
      db.select().from(dbConfig.schema.other).get()?.lastDeliveryFailure,
    ).toBeNull();
    expect(deleteAlarm).toHaveBeenCalledTimes(1);
  });
});

it('retries a committed receiver prefix without skipping the rest of its page', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  for (let outboxIndex = 1; outboxIndex <= 65; outboxIndex++) {
    db.insert(dbConfig.schema.outbox)
      .values({ outboxIndex, payload: `${outboxIndex}` })
      .run();
  }
  const committed = new Set<number>();
  let attempts = 0;
  const pages: number[][] = [];
  const queue = makeOutboxQueue({
    name: 'prefix',
    db,
    outboxTable: dbConfig.schema.outbox,
    retention: 'delete',
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),
    deliver: rows =>
      Effect.gen(function* () {
        attempts++;
        pages.push(rows.map(row => row.outboxIndex));
        for (const row of rows) {
          committed.add(row.outboxIndex);
          if (attempts === 1 && committed.size === 3) {
            return yield* new ZerospinError({
              code: 'partial-commit',
              message: 'Interrupted after three rows',
            });
          }
        }
      }),
  });
  await Effect.runPromise(queue.drain().pipe(Effect.provide(AsyncLive)));
  expect(pages.map(page => page.length)).toEqual([64, 64, 1]);
  expect(pages[1]).toEqual(pages[0]);
  expect([...committed]).toEqual(
    Array.from({ length: 65 }, (_, index) => index + 1),
  );
  expect(db.select().from(dbConfig.schema.outbox).all()).toEqual([]);
});
