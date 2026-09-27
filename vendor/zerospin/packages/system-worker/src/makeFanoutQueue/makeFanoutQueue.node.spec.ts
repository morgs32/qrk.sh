import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { makeTable, primitives } from '@zerospin/schema';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

import { makeFanoutQueue, type IFanoutDelivery } from './makeFanoutQueue.js';

const schema = {
  entries: makeTable({
    name: 'fanoutTestEntries',
    shape: {
      position: primitives.integer({ primaryKey: true }),
      value: primitives.integer(),
    },
  }),
  subscribers: makeTable({
    name: 'fanoutTestSubscribers',
    shape: {
      id: primitives.primaryKey({ abbreviation: 'sub' }),
      currentIndex: primitives.integer({ nullable: true }),
      failure: primitives.json({ schema: PublicFailureSchema, nullable: true }),
    },
  }),
};
const dbConfig = makeDbConfig({ tables: schema });

describe('fanout drainAfter', () => {
  it('starts delivery without firing an alarm and returns before the receiver', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(dbConfig);
        db.insert(dbConfig.schema.subscribers)
          .values({ id: 'sub_sink', currentIndex: 0, failure: null })
          .run();
        let release!: () => void;
        const pages: number[][] = [];
        const receiver = vi.fn(
          () =>
            new Promise<void>(resolve => {
              release = resolve;
            }),
        );
        const storage = {
          setAlarm: vi.fn(async () => {}),
          deleteAlarm: vi.fn(async () => {}),
        };
        const queue = makeFanoutQueue({
          name: 'testFanout',
          db,
          schema: dbConfig.schema,
          entriesTableName: 'entries',
          subscribersTableName: 'subscribers',
          indexColumnName: 'position',
          concurrency: 1,
          alarmRegistry: makeAlarmRegistry({ storage }),
          subscriberNameUtils: makeRepoNameUtils({
            abbreviation: undefined,
            namePattern: RoutePattern.parse('/:id'),
          }),
          key: { source: 'test' },
          getRepo: () =>
            Effect.succeed({
              testFanoutSubscriber: async () => ({
                receive: async (
                  delivery: IFanoutDelivery<
                    typeof dbConfig.schema.entries.$inferSelect
                  >,
                ) => {
                  pages.push(delivery.rows.map(row => row.position));
                  await receiver();
                  return Effect.runPromise(Effect.void.pipe(makeRpcEnvelope));
                },
              }),
            }),
        });
        const result = yield* queue.drainAfter(() =>
          Effect.sync(() => {
            db.insert(dbConfig.schema.entries)
              .values({ position: 1, value: 42 })
              .run();
            return 'admitted';
          }),
        );
        expect(result).toBe('admitted');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(1)),
        );
        expect(
          db
            .select()
            .from(dbConfig.schema.subscribers)
            .where(eq(dbConfig.schema.subscribers.id, 'sub_sink'))
            .get()?.currentIndex,
        ).toBe(0);
        yield* queue.drainAfter(() =>
          Effect.sync(() => {
            db.insert(dbConfig.schema.entries)
              .values({ position: 2, value: 43 })
              .run();
          }),
        );
        release();
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(2)),
        );
        expect(pages).toEqual([[1], [2]]);
        release();
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(
              db.select().from(dbConfig.schema.subscribers).get()?.currentIndex,
            ).toBe(2),
          ),
        );
        const failed = yield* Effect.exit(
          queue.drainAfter(() =>
            Effect.sync(() => {
              db.insert(dbConfig.schema.entries)
                .values({ position: 3, value: 44 })
                .run();
            }).pipe(
              Effect.flatMap(() => Effect.fail(new Error('producer failed'))),
            ),
          ),
        );
        expect(failed._tag).toBe('Failure');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(3)),
        );
        release();
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(
              db
                .select()
                .from(dbConfig.schema.subscribers)
                .where(eq(dbConfig.schema.subscribers.id, 'sub_sink'))
                .get()?.currentIndex,
            ).toBe(3),
          ),
        );
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('does not run a producer when its initial recovery alarm fails', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(dbConfig);
        const producer = vi.fn();
        const receiver = vi.fn();
        const queue = makeFanoutQueue({
          name: 'testFanoutAlarmFailure',
          db,
          schema: dbConfig.schema,
          entriesTableName: 'entries',
          subscribersTableName: 'subscribers',
          indexColumnName: 'position',
          concurrency: 1,
          alarmRegistry: makeAlarmRegistry({
            storage: {
              setAlarm: async () => {
                throw new Error('alarm unavailable');
              },
              deleteAlarm: async () => {},
            },
          }),
          subscriberNameUtils: makeRepoNameUtils({
            abbreviation: undefined,
            namePattern: RoutePattern.parse('/:id'),
          }),
          key: { source: 'test' },
          getRepo: () =>
            Effect.succeed({
              testFanoutAlarmFailureSubscriber: async () => ({
                receive: async () => {
                  receiver();
                  return Effect.runPromise(Effect.void.pipe(makeRpcEnvelope));
                },
              }),
            }),
        });
        const failed = yield* Effect.exit(
          queue.drainAfter(() =>
            Effect.sync(() => {
              producer();
            }),
          ),
        );
        expect(failed._tag).toBe('Failure');
        expect(producer).not.toHaveBeenCalled();
        expect(receiver).not.toHaveBeenCalled();
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
