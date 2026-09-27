import { it } from '@effect/vitest';
import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { PublicFailureSchema } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { makeTable, primitives } from '@zerospin/schema';
import { asc, desc } from 'drizzle-orm';
import { Effect } from 'effect';
import { expect, vi } from 'vitest';

import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';
import {
  makeFanoutQueue,
  type IFanoutDelivery,
} from '../makeFanoutQueue/makeFanoutQueue.js';

import { makeFanoutSubscriber } from './makeFanoutSubscriber.js';

const dbConfig = makeDbConfig({
  tables: {
    entries: makeTable({
      name: 'fanoutArchiveEntries',
      shape: {
        position: primitives.integer({ primaryKey: true }),
        value: primitives.integer(),
      },
    }),
    subscribers: makeTable({
      name: 'fanoutArchiveSubscribers',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'sub' }),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
    received: makeTable({
      name: 'fanoutReceivedEntries',
      shape: {
        position: primitives.integer({ primaryKey: true }),
        value: primitives.integer(),
      },
    }),
  },
});
const { entries, subscribers, received } = dbConfig.schema;

const fixture = Effect.gen(function* () {
  const { db } = yield* makeActorSnapshotDb(dbConfig);
  const rows = Array.from({ length: 65 }, (_, index) => ({
    position: index + 1,
    value: index + 100,
  }));
  db.insert(entries).values(rows).run();
  const getCurrentIndex = () =>
    db.select().from(received).orderBy(desc(received.position)).get()
      ?.position ?? 0;
  const receive = vi.fn((delivery: IFanoutDelivery<(typeof rows)[number]>) =>
    Effect.sync(() => {
      db.insert(received)
        .values([...delivery.rows])
        .onConflictDoNothing()
        .run();
    }),
  );
  const queue = makeFanoutQueue({
    name: 'archive',
    db,
    schema: dbConfig.schema,
    entriesTableName: 'entries',
    subscribersTableName: 'subscribers',
    indexColumnName: 'position',
    concurrency: 1,
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => {},
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
        archiveSubscriber: async () => ({
          receive: (delivery: IFanoutDelivery<(typeof rows)[number]>) =>
            Effect.runPromise(receive(delivery).pipe(makeRpcEnvelope)),
        }),
      }),
  });
  const subscriber = makeFanoutSubscriber<
    'archive',
    { source: string },
    { id: string },
    typeof entries.$inferSelect
  >({
    name: 'archive',
    sourceKey: { source: 'test' },
    key: { id: 'sub_sink' },
    getRepo: () => Effect.succeed({ archive: Promise.resolve(queue) }),
    getCurrentIndex,
    receive,
  });
  return { db, rows, queue, subscriber, getCurrentIndex, receive };
});

it.effect(
  'pulls and commits a fixed archive destination across pages without enrolling',
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const readPage = f.queue.getPage.bind(f.queue);
      const getPage = vi.spyOn(f.queue, 'getPage');
      const subscribe = vi.spyOn(f.queue, 'subscribe');
      getPage.mockImplementationOnce(async page => {
        const result = await readPage(page);
        // The source advances after the first page captured its destination.
        f.db.insert(entries).values({ position: 66, value: 165 }).run();
        return result;
      });

      expect(f.getCurrentIndex()).toBe(0);
      const result = yield* Effect.promise(() => f.subscriber.catchup()).pipe(
        Effect.flatMap(readRpcEnvelope),
      );
      expect(result).toBeUndefined();
      expect(getPage.mock.calls).toEqual([
        [{ afterIndex: 0 }],
        [{ afterIndex: 64, maxIndex: 65 }],
      ]);
      expect(
        f.receive.mock.calls.map(([page]) => ({
          count: page.rows.length,
          lastIndex: page.lastIndex,
        })),
      ).toEqual([
        { count: 64, lastIndex: 65 },
        { count: 1, lastIndex: 66 },
      ]);
      expect(
        f.db.select().from(received).orderBy(asc(received.position)).all(),
      ).toEqual(f.rows);
      expect(f.getCurrentIndex()).toBe(65);
      expect(subscribe).not.toHaveBeenCalled();
      expect(f.db.select().from(subscribers).all()).toEqual([]);
    }).pipe(Effect.provide(AsyncLive)),
);

it.effect(
  'commits initial archive catch-up before enrollment, then receives live delivery',
  () =>
    Effect.gen(function* () {
      const f = yield* fixture;
      const enroll = f.queue.subscribe.bind(f.queue);
      const subscribe = vi
        .spyOn(f.queue, 'subscribe')
        .mockImplementation(props => {
          expect(
            f.db.select().from(received).orderBy(asc(received.position)).all(),
          ).toEqual(f.rows);
          expect(props).toEqual({ id: 'sub_sink', currentIndex: 65 });
          return enroll(props);
        });

      const result = yield* Effect.promise(() => f.subscriber.subscribe()).pipe(
        Effect.flatMap(readRpcEnvelope),
      );
      expect(result).toBeUndefined();
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(f.db.select().from(subscribers).get()).toEqual({
        id: 'sub_sink',
        currentIndex: 65,
        failure: null,
      });

      const next = { position: 66, value: 165 };
      f.db.insert(entries).values(next).run();
      yield* Effect.promise(() => f.queue.drain());
      expect(f.receive).toHaveBeenLastCalledWith({
        rows: [next],
        lastIndex: 66,
      });
      expect(
        f.db.select().from(received).orderBy(asc(received.position)).all(),
      ).toEqual([...f.rows, next]);
      expect(f.db.select().from(subscribers).get()?.currentIndex).toBe(66);
    }).pipe(Effect.provide(AsyncLive)),
);
