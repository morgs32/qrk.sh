import { RoutePattern } from '@remix-run/route-pattern';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { RpcTarget } from 'capnweb';
import { asc, eq, ne, sql } from 'drizzle-orm';
import { Deferred, Effect, Fiber, type Context } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

import {
  makeFanoutQueue,
  type FanoutQueueRow,
  type IFanoutDelivery,
} from './makeFanoutQueue.js';

const testFanoutDbConfig = makeDbConfig({
  tables: {
    indexLog: makeTable({
      name: 'indexLog',
      shape: {
        outboxIndex: primitives.integer({ primaryKey: true }),
        payload: primitives.text(),
      },
    }),
    aggregateLog: makeTable({
      name: 'aggregateLog',
      shape: {
        aggregateIndex: primitives.integer({ primaryKey: true }),
        payload: primitives.text(),
      },
    }),
    fanoutLog: makeTable({
      name: 'fanoutLog',
      shape: {
        fanoutIndex: primitives.integer({ primaryKey: true }),
        payload: primitives.text(),
      },
    }),
    subscribers: makeTable({
      name: 'subscribers',
      shape: {
        subscriberRepoName: primitives.primaryKey({ abbreviation: 'testsub' }),
        aggregateId: primitives.text(),
        aggregateName: primitives.text(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
  },
});

const nameUtils = makeRepoNameUtils({
  abbreviation: 'testsub',
  namePattern: RoutePattern.parse(
    '/:systemId/:aggregateId/:aggregateName/:userId/:frontendName',
  ),
});

const concurrencyNameUtils = makeRepoNameUtils({
  abbreviation: 'testsub',
  namePattern: RoutePattern.parse('/:systemId/:aggregateId/:aggregateName'),
});

it('allows activation to subscribe during delivery and never regresses an in-flight acknowledgement', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const tables = testFanoutDbConfig.schema;
  db.insert(tables.fanoutLog)
    .values({ fanoutIndex: 1, payload: 'first' })
    .run();
  const key = {
    systemId: 'sys_test',
    aggregateId: 'acct_activation',
    aggregateName: 'user',
  };
  db.insert(tables.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/acct_activation/user',
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      currentIndex: 0,
    })
    .run();
  const activated = Promise.withResolvers<void>();
  const acknowledge = Promise.withResolvers<void>();
  let activate: (() => Promise<void>) | undefined;
  const delivered: number[][] = [];
  const queue = makeFanoutQueue({
    concurrency: 1,
    name: 'activation',
    db,
    schema: tables,
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscribersTableName: 'subscribers',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: key.systemId },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),
    getRepo: () =>
      Effect.succeed({
        activationSubscriber: async () => {
          await activate?.();
          return {
            receive: async (delivery: {
              rows: readonly { fanoutIndex: number }[];
            }) => {
              delivered.push(delivery.rows.map(row => row.fanoutIndex));
              await acknowledge.promise;
              return encodeSuccess(undefined);
            },
          };
        },
      }),
  });
  activate = async () => {
    activate = undefined;
    // Catch-up can commit a newer page while this drain still owns an older one.
    db.insert(tables.fanoutLog)
      .values({ fanoutIndex: 2, payload: 'during-activation' })
      .run();
    expect(await queue.subscribe({ ...key, currentIndex: 2 })).toMatchObject({
      _tag: 'Success',
    });
    activated.resolve();
  };
  const draining = queue.drain();
  try {
    await activated.promise;
    expect(await queue.subscribe({ ...key, currentIndex: 0 })).toMatchObject({
      _tag: 'Success',
    });
    expect(db.select().from(tables.subscribers).get()?.currentIndex).toBe(2);
  } finally {
    acknowledge.resolve();
  }
  await draining;
  await queue.drain();
  expect(delivered).toEqual([[1]]);
  expect(db.select().from(tables.subscribers).get()?.currentIndex).toBe(2);
});

describe('makeFanoutQueue', () => {
  it('shares rows across 101 subscribers and never retries a failed subscriber', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: testFanoutDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.insert(testFanoutDbConfig.schema.fanoutLog)
      .values([
        { fanoutIndex: 1, payload: 'a' },
        { fanoutIndex: 2, payload: 'b' },
      ])
      .run();
    for (let id = 0; id < 101; id += 1) {
      db.insert(testFanoutDbConfig.schema.subscribers)
        .values({
          subscriberRepoName: `testsub_sys_test/acct_${id}/user`,
          aggregateId: `acct_${id}`,
          aggregateName: 'user',
          currentIndex: 0,
          failure: null,
        })
        .run();
    }
    const outcomes = new Map<string, number[]>();
    let maximumActive = 0;
    let active = 0;
    let failedAttempts = 0;
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const alarmRegistry = makeAlarmRegistry({
      storage: { setAlarm, deleteAlarm },
    });
    const queue = makeFanoutQueue({
      concurrency: 100,
      name: 'makeFanoutQueue.acceptance',
      alarmRegistry,
      db,

      schema: testFanoutDbConfig.schema,
      subscribersTableName: 'subscribers',
      entriesTableName: 'fanoutLog',
      indexColumnName: 'fanoutIndex',
      subscriberNameUtils: concurrencyNameUtils,
      key: {
        systemId: 'sys_test',
      },
      getRepo: ({ key }) =>
        Effect.succeed({
          'makeFanoutQueue.acceptanceSubscriber': () =>
            Promise.resolve(
              new (class extends RpcTarget {
                async receive({
                  rows,
                }: IFanoutDelivery<{ fanoutIndex: number; payload: string }>) {
                  active += 1;
                  maximumActive = Math.max(maximumActive, active);
                  await Effect.runPromise(Effect.sleep(5));
                  active -= 1;
                  if (key.aggregateId === 'acct_0') {
                    failedAttempts += 1;
                    return encodeFailure(
                      new ZerospinError({
                        code: 'make-fanout-queue-acceptance-failure',
                        message: 'Fail only subscriber zero',
                      }),
                    );
                  }
                  const subscriberOutcomes =
                    outcomes.get(key.aggregateId) ?? [];
                  subscriberOutcomes.push(rows.at(-1)!.fanoutIndex);
                  outcomes.set(key.aggregateId, subscriberOutcomes);
                  return encodeSuccess(undefined);
                }
              })(),
            ),
        }),
    });

    await expect(queue.drain()).rejects.toBeDefined();

    expect(maximumActive).toBe(100);
    expect(failedAttempts).toBe(1);
    expect(
      db
        .select()
        .from(testFanoutDbConfig.schema.subscribers)
        .all()
        .find(row => row.aggregateId === 'acct_0')?.currentIndex,
    ).toBe(0);
    for (const subscriber of db
      .select()
      .from(testFanoutDbConfig.schema.subscribers)
      .all()
      .filter(row => row.aggregateId !== 'acct_0')) {
      expect(subscriber.currentIndex).toBe(2);
      expect(outcomes.get(subscriber.aggregateId)).toEqual([2]);
    }
    expect(setAlarm).toHaveBeenCalledTimes(1);
    expect(deleteAlarm).toHaveBeenCalledTimes(1);
    await queue.drain();
    expect(failedAttempts).toBe(1);
  });

  it('enrolls from MatchParams + currentIndex and rejects key mismatch', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: testFanoutDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const alarmRegistry = makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    });
    const queue = makeFanoutQueue({
      concurrency: 100,
      name: 'testFanout',
      alarmRegistry,
      db,

      schema: testFanoutDbConfig.schema,
      subscribersTableName: 'subscribers',
      entriesTableName: 'fanoutLog',
      indexColumnName: 'fanoutIndex',
      subscriberNameUtils: nameUtils,
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
      },
      getRepo: () =>
        Effect.succeed({
          testFanoutSubscriber: () =>
            Promise.resolve(
              new (class extends RpcTarget {
                async receive() {
                  return encodeSuccess(undefined);
                }
              })(),
            ),
        }),
    });

    const ok = await queue.subscribe({
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      userId: 'user_owner',
      frontendName: 'main',
      currentIndex: 3,
    });
    expect(ok._tag).toBe('Success');
    expect(
      db.select().from(testFanoutDbConfig.schema.subscribers).get(),
    ).toMatchObject({
      aggregateId: 'acct_test',
      aggregateName: 'user',
      currentIndex: 3,
    });

    const encoded = await queue.subscribe({
      systemId: 'sys_test',
      aggregateId: 'acct_other',
      aggregateName: 'user',
      userId: 'user_owner',
      frontendName: 'main',
      currentIndex: null,
    });
    expect(encoded._tag).toBe('Failure');
    expect(
      db.select().from(testFanoutDbConfig.schema.subscribers).all(),
    ).toHaveLength(1);
  });

  it('releases the alarm lease in the same drain after delivery', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: testFanoutDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.insert(testFanoutDbConfig.schema.fanoutLog)
      .values([
        { fanoutIndex: 1, payload: 'a' },
        { fanoutIndex: 2, payload: 'b' },
      ])
      .run();
    const delivered: string[][] = [];
    const deleteAlarm = vi.fn(async () => undefined);
    const alarmRegistry = makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    });
    const queue = makeFanoutQueue({
      concurrency: 100,
      name: 'testFanout.page',
      alarmRegistry,
      db,

      schema: testFanoutDbConfig.schema,
      subscribersTableName: 'subscribers',
      entriesTableName: 'fanoutLog',
      indexColumnName: 'fanoutIndex',
      subscriberNameUtils: nameUtils,
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
      },
      getRepo: () =>
        Effect.succeed({
          'testFanout.pageSubscriber': () =>
            Promise.resolve(
              new (class extends RpcTarget {
                async receive({
                  rows,
                }: IFanoutDelivery<{ fanoutIndex: number; payload: string }>) {
                  delivered.push(rows.map(row => row.payload));
                  return encodeSuccess(undefined);
                }
              })(),
            ),
        }),
    });
    const drain = vi.spyOn(queue, 'drain');
    await queue.subscribe({
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      userId: 'user_owner',
      frontendName: 'main',
      currentIndex: 0,
    });
    await drain.mock.results[0]!.value;
    expect(delivered).toEqual([['a', 'b']]);
    expect(
      db.select().from(testFanoutDbConfig.schema.subscribers).get()
        ?.currentIndex,
    ).toBe(2);
    expect(deleteAlarm).toHaveBeenCalledTimes(1);
    await queue.drain();
    expect(deleteAlarm).toHaveBeenCalledTimes(2);
    expect(delivered).toEqual([['a', 'b']]);
  });
});

it.each([
  'success',
  'name-failure',
  'lookup-failure',
  'accessor-throw',
  'accessor-rejection',
  'receive-failure',
  'receive-rejection',
])(
  'shares full pages oldest-first and persists terminal %s outcomes',
  async outcome => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    db.insert(testFanoutDbConfig.schema.subscribers)
      .values([
        {
          subscriberRepoName:
            outcome === 'name-failure' ? 'invalid' : 'testsub_sys_test/a/user',
          aggregateId: 'a',
          aggregateName: 'user',
          currentIndex: null,
        },
        ...['b', 'c', 'd', 'e'].map((id, outboxIndex) => ({
          subscriberRepoName: `testsub_sys_test/${id}/user`,
          aggregateId: id,
          aggregateName: 'user',
          currentIndex: [0, 1, 3, 5][outboxIndex]!,
        })),
      ])
      .run();
    const rows = [1, 2, 3, 4].map(aggregateIndex => ({
      aggregateIndex,
      payload: `command ${aggregateIndex}`,
    }));

    db.insert(testFanoutDbConfig.schema.aggregateLog).values(rows).run();
    const select = vi.spyOn(db, 'select');
    const delivered: Array<{ id: string; indices: number[] }> = [];
    const resolutions: string[] = [];
    const failure = new ZerospinError({
      code: 'fanout-test-failure',
      message: 'First subscriber failed',
    });
    const deleteAlarm = vi.fn(async () => undefined);
    const queue = makeFanoutQueue({
      name: 'shared',
      db,
      schema: testFanoutDbConfig.schema,
      subscribersTableName: 'subscribers',
      entriesTableName: 'aggregateLog',
      indexColumnName: 'aggregateIndex',
      subscriberNameUtils: concurrencyNameUtils,
      key: { systemId: 'sys_test' },
      alarmRegistry: makeAlarmRegistry({
        storage: { setAlarm: async () => undefined, deleteAlarm },
      }),
      concurrency: 2,

      getRepo: ({ key }) =>
        Effect.gen(function* () {
          expect(key).toEqual({
            systemId: 'sys_test',
            aggregateId: key.aggregateId,
            aggregateName: 'user',
          });
          resolutions.push(key.aggregateId);
          if (key.aggregateId === 'a' && outcome === 'lookup-failure') {
            return yield* failure;
          }
          return {
            sharedSubscriber(sourceKey: { systemId: string }) {
              expect(sourceKey).toEqual({ systemId: 'sys_test' });
              if (key.aggregateId === 'a' && outcome === 'accessor-throw') {
                throw new Error('Getter threw');
              }
              if (key.aggregateId === 'a' && outcome === 'accessor-rejection') {
                return Promise.reject(new Error('Getter rejected'));
              }
              return Promise.resolve(
                new (class extends RpcTarget {
                  async receive({
                    rows: suffix,
                  }: IFanoutDelivery<{
                    aggregateIndex: number;
                    payload: string;
                  }>) {
                    delivered.push({
                      id: key.aggregateId,
                      indices: suffix.map(row => row.aggregateIndex),
                    });
                    expect(suffix).toEqual(
                      rows.filter(row =>
                        suffix.some(
                          item => item.aggregateIndex === row.aggregateIndex,
                        ),
                      ),
                    );
                    if (key.aggregateId === 'a') {
                      if (outcome === 'receive-failure') {
                        return encodeFailure(failure);
                      }
                      if (outcome === 'receive-rejection') {
                        throw new Error('Receive rejected');
                      }
                    }
                    return encodeSuccess(undefined);
                  }
                })(),
              );
            },
          };
        }),
    });
    expectTypeOf<FanoutQueueRow<typeof queue>>().toEqualTypeOf<{
      aggregateIndex: number;
      payload: string;
    }>();
    if (outcome === 'success') {
      await expect(queue.drain()).resolves.toBeUndefined();
    } else {
      await expect(queue.drain()).rejects.toBeDefined();
    }
    expect(
      select.mock.calls.filter(([fields]) => fields && 'row' in fields),
    ).toHaveLength(1);
    expect(delivered.filter(item => item.id !== 'a')).toEqual([
      { id: 'b', indices: [1, 2, 3, 4] },
      { id: 'c', indices: [2, 3, 4] },
      { id: 'd', indices: [4] },
    ]);
    const subscriber = db
      .select()
      .from(testFanoutDbConfig.schema.subscribers)
      .where(eq(testFanoutDbConfig.schema.subscribers.aggregateId, 'a'))
      .get();
    expect(subscriber?.currentIndex).toBe(outcome === 'success' ? 4 : null);
    if (outcome === 'success') {
      expect(subscriber?.failure).toBeNull();
      expect(delivered.find(item => item.id === 'a')?.indices).toEqual([
        1, 2, 3, 4,
      ]);
    } else {
      expect(subscriber?.failure).toEqual(expect.any(String));
    }
    const previousDeliveries = delivered.slice();
    const previousResolutions = resolutions.slice();
    await queue.drain();
    expect(delivered).toEqual(previousDeliveries);
    expect(resolutions).toEqual(previousResolutions);
    expect(deleteAlarm).toHaveBeenCalledTimes(2);
  },
);

it('discovers the persisted tip on every drain', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  db.insert(testFanoutDbConfig.schema.fanoutLog)
    .values([
      { fanoutIndex: 1, payload: 'success' },
      { fanoutIndex: 2, payload: 'rejection' },
    ])
    .run();
  const deleteAlarm = vi.fn(async () => undefined);
  const delivered: string[][] = [];

  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'finalized',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    }),

    getRepo: () =>
      Effect.succeed({
        finalizedSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive({
                rows,
              }: IFanoutDelivery<{ fanoutIndex: number; payload: string }>) {
                delivered.push(rows.map(row => row.payload));
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await queue.drain();
  expect(delivered).toEqual([['success', 'rejection']]);
  await queue.drain();
  expect(deleteAlarm).toHaveBeenCalledTimes(2);
  db.insert(testFanoutDbConfig.schema.fanoutLog)
    .values([
      { fanoutIndex: 3, payload: 'success' },
      { fanoutIndex: 4, payload: 'success' },
    ])
    .run();
  await queue.drain();
  expect(delivered).toEqual([
    ['success', 'rejection'],
    ['success', 'success'],
  ]);
});

it('serializes drains while repeated enrollment preserves progress', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 129 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  const entered = Deferred.makeUnsafe<void>();
  const release = Deferred.makeUnsafe<void>();

  const delivered: number[] = [];
  const tasks: Promise<void>[] = [];
  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'serialized',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: () =>
      Effect.succeed({
        serializedSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive({
                rows,
              }: IFanoutDelivery<{ outboxIndex: number }>) {
                delivered.push(...rows.map(row => row.outboxIndex));
                if (delivered.length === 64) {
                  await Effect.runPromise(Deferred.succeed(entered, undefined));
                  await Effect.runPromise(Deferred.await(release));
                }
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  const params = {
    systemId: 'sys_test',
    aggregateId: 'a',
    aggregateName: 'user',
    currentIndex: 0,
  };
  await queue.subscribe(params);
  tasks.push(queue.drain());
  await Effect.runPromise(Deferred.await(entered));
  tasks.push(queue.drain());
  const enrollment = queue.subscribe(params);
  await enrollment;
  expect(delivered).toHaveLength(64);
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(0);
  await Effect.runPromise(Deferred.succeed(release, undefined));
  await Promise.all(tasks);
  await queue.drain();
  expect(delivered).toEqual(
    Array.from({ length: 129 }, (_, outboxIndex) => outboxIndex + 1),
  );
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(129);
});

it('releases an empty subscriber queue and retains its lease when the suffix query fails', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  const deleteAlarm = vi.fn(async () => undefined);

  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'empty',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    }),

    getRepo: () =>
      Effect.succeed({
        emptySubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await queue.drain();
  db.run(sql.raw('DROP TABLE indexLog'));
  expect(deleteAlarm).toHaveBeenCalledTimes(1);
  await queue.subscribe({
    systemId: 'sys_test',
    aggregateId: 'a',
    aggregateName: 'user',
    currentIndex: 0,
  });
  await expect(queue.drain()).rejects.toBeDefined();
  expect(deleteAlarm).toHaveBeenCalledTimes(1);
});

it.each([0, -1, 1.5, Infinity, NaN])(
  'rejects invalid concurrency %s',
  async concurrency => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );

    db.insert(testFanoutDbConfig.schema.indexLog)
      .values(
        Array.from({ length: 1 }, (_, offset) => ({
          outboxIndex: offset + 1,
          payload: `row ${offset + 1}`,
        })),
      )
      .run();
    expect(() =>
      makeFanoutQueue({
        name: 'invalid',
        db,
        schema: testFanoutDbConfig.schema,
        subscribersTableName: 'subscribers',
        entriesTableName: 'indexLog',
        indexColumnName: 'outboxIndex',
        subscriberNameUtils: concurrencyNameUtils,
        key: { systemId: 'sys_test' },
        concurrency,
        alarmRegistry: makeAlarmRegistry({
          storage: {
            setAlarm: async () => undefined,
            deleteAlarm: async () => undefined,
          },
        }),

        // @ts-expect-error The capability name must match the queue name.
        getRepo: () =>
          Effect.succeed({
            wrongSubscriber: () =>
              Promise.resolve(
                new (class extends RpcTarget {
                  async receive() {
                    return encodeSuccess(undefined);
                  }
                })(),
              ),
          }),
      }),
    ).toThrow('Fanout concurrency must be a positive integer');
  },
);

it('aborts and retains its lease when neither progress nor failure can be persisted', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  db.run(
    sql.raw(
      "CREATE TRIGGER reject_cursor BEFORE UPDATE ON subscribers BEGIN SELECT RAISE(FAIL, 'cursor write failed'); END",
    ),
  );
  const deleteAlarm = vi.fn(async () => undefined);
  const delivered = vi.fn(() => undefined);
  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'persist',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    }),

    getRepo: () =>
      Effect.succeed({
        persistSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                delivered();
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await expect(queue.drain()).rejects.toBeDefined();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(0);
  expect(deleteAlarm).not.toHaveBeenCalled();
  db.run(sql.raw('DROP TRIGGER reject_cursor'));
  await queue.drain();
  expect(delivered).toHaveBeenCalledTimes(2);
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(1);
});

it('schedules subscription-triggered draining after releasing the enrollment lock', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'subscribe-wakeup',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: () =>
      Effect.succeed({
        'subscribe-wakeupSubscriber': () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  const drain = vi.spyOn(queue, 'drain');
  expect(
    await queue.subscribe({
      systemId: 'sys_test',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    }),
  ).toMatchObject({ _tag: 'Success' });
  expect(drain).toHaveBeenCalledOnce();
  await drain.mock.results[0]!.value;
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(1);
});

it('delivers full pages until every subscriber catches up', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 128 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values(
      ['a', 'b', 'c', 'd'].map(id => ({
        subscriberRepoName: `testsub_sys_test/${id}/user`,
        aggregateId: id,
        aggregateName: 'user',
        currentIndex: 0,
      })),
    )
    .run();
  const delivered: string[] = [];
  const queue = makeFanoutQueue({
    name: 'exclude-attempts',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    concurrency: 2,
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: ({ key }) =>
      Effect.succeed({
        'exclude-attemptsSubscriber': () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                delivered.push(key.aggregateId);
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await queue.drain();
  expect(delivered).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd']);
  expect(
    db
      .select()
      .from(testFanoutDbConfig.schema.subscribers)
      .all()
      .every(row => row.currentIndex === 128),
  ).toBe(true);
});

it('handles an ignored drain rejection while preserving the original rejection and terminal failure', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  let attempt = 0;
  const queue = makeFanoutQueue({
    concurrency: 100,
    name: 'persist-defect',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: () =>
      Effect.succeed({
        'persist-defectSubscriber': () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                attempt += 1;
                throw new Error('receiver defect');
              }
            })(),
          ),
      }),
  });
  const unhandledRejection = vi.fn();
  process.on('unhandledRejection', unhandledRejection);
  try {
    const draining = queue.drain();
    // Let the unawaited delivery fail and pass the unhandled-rejection turn.
    await vi.waitFor(() => {
      expect(
        db.select().from(testFanoutDbConfig.schema.subscribers).get()?.failure,
      ).toContain('receiver defect');
    });
    await new Promise(resolve => setImmediate(resolve));
    expect(unhandledRejection).not.toHaveBeenCalled();
    await expect(draining).rejects.toBeDefined();
  } finally {
    process.off('unhandledRejection', unhandledRejection);
  }
  const failure = db
    .select()
    .from(testFanoutDbConfig.schema.subscribers)
    .get()?.failure;
  expect(failure).toContain('receiver defect');
  await queue.drain();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.failure,
  ).toBe(failure);
  await queue.drain();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get(),
  ).toMatchObject({
    currentIndex: 0,
    failure,
  });
  expect(attempt).toBe(1);
});

it('refills slots beside slow deliveries and refetches older full pages', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 192 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values(
      ['a', 'b'].map(id => ({
        subscriberRepoName: `testsub_sys_test/${id}/user`,
        aggregateId: id,
        aggregateName: 'user',
        currentIndex: 0,
      })),
    )
    .run();
  const releaseA = Deferred.makeUnsafe<void>();
  const releaseB = Deferred.makeUnsafe<void>();
  const bThirdPage = Deferred.makeUnsafe<void>();
  const aReselected = Deferred.makeUnsafe<void>();
  const active = new Set<string>();
  const commands = db.select().from(testFanoutDbConfig.schema.indexLog).all();
  const select = vi.spyOn(db, 'select');
  const queue = makeFanoutQueue({
    name: 'refill',
    concurrency: 2,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: ({ key }) =>
      Effect.succeed({
        refillSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive({
                rows,
              }: IFanoutDelivery<{
                outboxIndex: number;
                payload: string;
              }>) {
                const id = key.aggregateId;
                expect(active.has(id)).toBe(false);
                active.add(id);
                expect(active.size).toBeLessThanOrEqual(2);
                expect(rows).toEqual(
                  commands.filter(command =>
                    rows.some(row => row.outboxIndex === command.outboxIndex),
                  ),
                );
                if (id === 'a' && rows[0]!.outboxIndex === 1) {
                  await Effect.runPromise(Deferred.await(releaseA));
                }
                if (id === 'b' && rows[0]!.outboxIndex === 129) {
                  await Effect.runPromise(
                    Deferred.succeed(bThirdPage, undefined),
                  );
                  await Effect.runPromise(Deferred.await(releaseB));
                }
                if (id === 'a' && rows[0]!.outboxIndex === 65) {
                  expect(rows.map(row => row.outboxIndex)).toEqual(
                    Array.from(
                      { length: 64 },
                      (_, outboxIndex) => outboxIndex + 65,
                    ),
                  );
                  await Effect.runPromise(
                    Deferred.succeed(aReselected, undefined),
                  );
                }
                active.delete(id);
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  const draining = queue.drain();
  await Effect.runPromise(Deferred.await(bThirdPage));
  expect(active.has('a')).toBe(true);
  await Effect.runPromise(Deferred.succeed(releaseA, undefined));
  await Effect.runPromise(Deferred.await(aReselected));
  expect(
    select.mock.calls.filter(([fields]) => fields && 'row' in fields),
  ).toHaveLength(4);
  await Effect.runPromise(Deferred.succeed(releaseB, undefined));
  await draining;
  expect(active.size).toBe(0);
  expect(
    db
      .select()
      .from(testFanoutDbConfig.schema.subscribers)
      .all()
      .map(row => row.currentIndex),
  ).toEqual([192, 192]);
});

it('extends the active drain before a newer drain acquires the lock', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 2 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  const entered = Deferred.makeUnsafe<void>();
  const release = Deferred.makeUnsafe<void>();
  const delivered: number[][] = [];
  const queue = makeFanoutQueue({
    name: 'extend',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: () =>
      Effect.succeed({
        extendSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive({
                rows,
              }: IFanoutDelivery<{ outboxIndex: number }>) {
                delivered.push(rows.map(row => row.outboxIndex));
                if (delivered.length === 1) {
                  await Effect.runPromise(Deferred.succeed(entered, undefined));
                  await Effect.runPromise(Deferred.await(release));
                }
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  const first = queue.drain();
  await Effect.runPromise(Deferred.await(entered));
  db.insert(testFanoutDbConfig.schema.indexLog)
    .values([
      { outboxIndex: 3, payload: 'row 3' },
      { outboxIndex: 4, payload: 'row 4' },
    ])
    .run();
  const second = queue.drain();
  await new Promise(resolve => setImmediate(resolve));
  await Effect.runPromise(Deferred.succeed(release, undefined));
  await first;
  expect(delivered).toEqual([
    [1, 2],
    [3, 4],
  ]);
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(4);
  await second;
});

it('starts a cold subscription drain from the persisted tip without an owner wakeup', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 2 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  const setAlarm = vi.fn(async () => undefined);
  const delivered = vi.fn(() => encodeSuccess(undefined));
  const queue = makeFanoutQueue({
    name: 'cold',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: { setAlarm, deleteAlarm: async () => undefined },
    }),

    getRepo: () =>
      Effect.succeed({
        coldSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                return delivered();
              }
            })(),
          ),
      }),
  });
  const drain = vi.spyOn(queue, 'drain');
  expect(
    await queue.subscribe({
      systemId: 'sys_test',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: null,
    }),
  ).toMatchObject({ _tag: 'Success' });
  expect(setAlarm).toHaveBeenCalled();
  expect(drain).toHaveBeenCalledOnce();
  await drain.mock.results[0]!.value;
  expect(delivered).toHaveBeenCalledOnce();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(2);
});

it('preserves terminal failure across queue reconstruction and rejects re-enrollment', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  const failure = new ZerospinError({
    code: 'terminal-test',
    message: 'Receiver failed',
  });
  const receive = vi.fn(() => encodeFailure(failure));
  const props = {
    name: 'terminal',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers' satisfies 'subscribers',
    entriesTableName: 'indexLog' satisfies 'indexLog',
    indexColumnName: 'outboxIndex' satisfies 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: () =>
      Effect.succeed({
        terminalSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                return receive();
              }
            })(),
          ),
      }),
  };
  const first = makeFanoutQueue(props);
  const subscriber = {
    systemId: 'sys_test',
    aggregateId: 'a',
    aggregateName: 'user',
    currentIndex: null,
  };
  const drain = vi.spyOn(first, 'drain');
  await first.subscribe(subscriber);
  await expect(drain.mock.results[0]!.value).rejects.toBeDefined();
  const before = db.select().from(testFanoutDbConfig.schema.subscribers).get();
  const coldRegistry = makeAlarmRegistry({
    storage: {
      setAlarm: async () => undefined,
      deleteAlarm: async () => undefined,
    },
  });
  const cold = makeFanoutQueue({ ...props, alarmRegistry: coldRegistry });
  await Effect.runPromise(coldRegistry.run().pipe(Effect.provide(AsyncLive)));
  expect(
    await cold.subscribe({ ...subscriber, currentIndex: 1 }),
  ).toMatchObject({ _tag: 'Failure' });
  expect(db.select().from(testFanoutDbConfig.schema.subscribers).get()).toEqual(
    before,
  );
  expect(receive).toHaveBeenCalledOnce();
});

it('records an acknowledgement write failure once while healthy subscribers continue', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values(
      ['a', 'b'].map(id => ({
        subscriberRepoName: `testsub_sys_test/${id}/user`,
        aggregateId: id,
        aggregateName: 'user',
        currentIndex: 0,
      })),
    )
    .run();
  db.run(
    sql.raw(
      "CREATE TRIGGER reject_a_cursor BEFORE UPDATE OF currentIndex ON subscribers WHEN OLD.subscriberRepoName = 'testsub_sys_test/a/user' BEGIN SELECT RAISE(FAIL, 'cursor write failed'); END",
    ),
  );
  const delivered: string[] = [];
  const queue = makeFanoutQueue({
    name: 'ack-failure',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: ({ key }) =>
      Effect.succeed({
        'ack-failureSubscriber': () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                delivered.push(key.aggregateId);
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await expect(queue.drain()).rejects.toBeDefined();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).all(),
  ).toMatchObject([
    {
      currentIndex: 0,
      failure: expect.stringContaining('fanout-subscriber-delivery-defect'),
    },
    { currentIndex: 1, failure: null },
  ]);
  db.run(sql.raw('DROP TRIGGER reject_a_cursor'));
  await queue.drain();
  expect(delivered).toEqual(['a', 'b']);
});

it('starts delivery immediately and completes it when an awaiting caller is interrupted', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 1 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  const entered = Deferred.makeUnsafe<void>();
  const release = Deferred.makeUnsafe<void>();
  const deleteAlarm = vi.fn(async () => undefined);
  let attempts = 0;
  const controller = new AbortController();
  const queue = makeFanoutQueue({
    name: 'interrupted',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: { setAlarm: async () => undefined, deleteAlarm },
    }),

    getRepo: () =>
      Effect.succeed({
        interruptedSubscriber: () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                attempts += 1;
                await Effect.runPromise(Deferred.succeed(entered, undefined));
                await Effect.runPromise(Deferred.await(release));
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  expect(Object.hasOwn(queue, 'drain')).toBe(true);
  expect(Object.getPrototypeOf(queue)).not.toHaveProperty('drain');
  expectTypeOf(queue.drain).toEqualTypeOf<() => Promise<void>>();
  const draining = queue.drain();
  // No consumer has awaited the Promise, but subscriber delivery has begun.
  await Effect.runPromise(Deferred.await(entered));
  expect(attempts).toBe(1);
  const waiting = Effect.runPromise(
    makeAsync(() => draining).pipe(Effect.provide(AsyncLive)),
    { signal: controller.signal },
  );
  const rejected = expect(waiting).rejects.toBeDefined();
  controller.abort();
  await rejected;
  expect(deleteAlarm).not.toHaveBeenCalled();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get(),
  ).toMatchObject({ currentIndex: 0, failure: null });
  await Effect.runPromise(Deferred.succeed(release, undefined));
  await draining;
  expect(attempts).toBe(1);
  expect(deleteAlarm).toHaveBeenCalledOnce();
  expect(
    db.select().from(testFanoutDbConfig.schema.subscribers).get()?.currentIndex,
  ).toBe(1);
});

it('applies every subscriber predicate and excludes failures before limiting the page', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );

  db.insert(testFanoutDbConfig.schema.indexLog)
    .values(
      Array.from({ length: 2 }, (_, offset) => ({
        outboxIndex: offset + 1,
        payload: `row ${offset + 1}`,
      })),
    )
    .run();
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values(
      ['wrong-name', 'wrong-id', 'failed', 'healthy'].map(id => ({
        subscriberRepoName: `testsub_sys_test/${id}/user`,
        aggregateId: id,
        aggregateName: id === 'wrong-name' ? 'other' : 'user',
        currentIndex: id === 'healthy' ? 1 : null,
        failure: id === 'failed' ? 'terminal failure' : null,
      })),
    )
    .run();
  const delivered: string[] = [];
  const queue = makeFanoutQueue({
    name: 'subscriber-predicates',
    concurrency: 1,
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
    subscribersWhere: [
      eq(testFanoutDbConfig.schema.subscribers.aggregateName, 'user'),
      undefined,
      ne(testFanoutDbConfig.schema.subscribers.aggregateId, 'wrong-id'),
    ],
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: ({ key }) =>
      Effect.succeed({
        'subscriber-predicatesSubscriber': () =>
          Promise.resolve(
            new (class extends RpcTarget {
              async receive() {
                delivered.push(key.aggregateId);
                return encodeSuccess(undefined);
              }
            })(),
          ),
      }),
  });
  await queue.drain();
  expect(delivered).toEqual(['healthy']);
  expect(
    db
      .select({
        id: testFanoutDbConfig.schema.subscribers.aggregateId,
        currentIndex: testFanoutDbConfig.schema.subscribers.currentIndex,
        failure: testFanoutDbConfig.schema.subscribers.failure,
      })
      .from(testFanoutDbConfig.schema.subscribers)
      .orderBy(asc(testFanoutDbConfig.schema.subscribers.aggregateId))
      .all(),
  ).toEqual([
    { id: 'failed', currentIndex: null, failure: 'terminal failure' },
    { id: 'healthy', currentIndex: 2, failure: null },
    { id: 'wrong-id', currentIndex: null, failure: null },
    { id: 'wrong-name', currentIndex: null, failure: null },
  ]);
});

it('reads bounded pages outside the drain lock and retains the tip captured for delivery', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  db.insert(testFanoutDbConfig.schema.fanoutLog)
    .values(
      [1, 2, 3].map(fanoutIndex => ({
        fanoutIndex,
        payload: `row ${fanoutIndex}`,
      })),
    )
    .run();
  const entered = Deferred.makeUnsafe<void>();
  const release = Deferred.makeUnsafe<void>();
  const deliveries: IFanoutDelivery<{
    fanoutIndex: number;
    payload: string;
  }>[] = [];
  const sourceKey = {
    systemId: 'sys_test',
    serviceName: 'ledger',
    serviceVersion: 'v2',
  };
  const queue = makeFanoutQueue({
    name: 'enveloped',
    concurrency: 1,
    db,
    key: sourceKey,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers',
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscriberNameUtils: concurrencyNameUtils,
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),

    getRepo: ({ key }) =>
      Effect.succeed({
        envelopedSubscriber: (boundSourceKey: typeof sourceKey) => {
          expectTypeOf(boundSourceKey).toEqualTypeOf<{
            systemId: string;
            serviceName: string;
            serviceVersion: string;
          }>();
          expect(boundSourceKey).toEqual(sourceKey);
          expect(key).toEqual({
            systemId: 'sys_test',
            aggregateId: key.aggregateId,
            aggregateName: 'user',
          });
          return Promise.resolve(
            new (class extends RpcTarget {
              async receive(
                delivery: IFanoutDelivery<{
                  fanoutIndex: number;
                  payload: string;
                }>,
              ) {
                deliveries.push(delivery);
                if (key.aggregateId === 'a') {
                  await Effect.runPromise(Deferred.succeed(entered, undefined));
                  await Effect.runPromise(Deferred.await(release));
                }
                return encodeSuccess(undefined);
              }
            })(),
          );
        },
      }),
  });
  expect(await queue.getPage({ afterIndex: 0, maxIndex: 1 })).toEqual(
    encodeSuccess({
      rows: [{ fanoutIndex: 1, payload: 'row 1' }],
      lastIndex: 3,
    }),
  );
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values(
      ['a', 'b'].map(aggregateId => ({
        subscriberRepoName: `testsub_sys_test/${aggregateId}/user`,
        aggregateId,
        aggregateName: 'user',
        currentIndex: 0,
      })),
    )
    .run();
  const draining = queue.drain();
  await Effect.runPromise(Deferred.await(entered));
  db.insert(testFanoutDbConfig.schema.fanoutLog)
    .values({ fanoutIndex: 4, payload: 'row 4' })
    .run();
  expect(await queue.getPage({ afterIndex: 1, maxIndex: 2 })).toEqual(
    encodeSuccess({
      rows: [{ fanoutIndex: 2, payload: 'row 2' }],
      lastIndex: 4,
    }),
  );
  await Effect.runPromise(Deferred.succeed(release, undefined));
  await draining;
  expect(deliveries).toEqual([
    {
      rows: [
        { fanoutIndex: 1, payload: 'row 1' },
        { fanoutIndex: 2, payload: 'row 2' },
        { fanoutIndex: 3, payload: 'row 3' },
      ],
      lastIndex: 3,
    },
    {
      rows: [
        { fanoutIndex: 1, payload: 'row 1' },
        { fanoutIndex: 2, payload: 'row 2' },
        { fanoutIndex: 3, payload: 'row 3' },
      ],
      lastIndex: 3,
    },
  ]);
  expect(
    db
      .select()
      .from(testFanoutDbConfig.schema.subscribers)
      .all()
      .map(row => row.currentIndex),
  ).toEqual([3, 3]);
});

it('rebuilds registry delivery from durable subscriber progress without starting during construction', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  db.insert(testFanoutDbConfig.schema.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/a/user',
      aggregateId: 'a',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  const delivered: number[] = [];
  for (const index of [1, 2]) {
    db.insert(testFanoutDbConfig.schema.indexLog)
      .values({ outboxIndex: index, payload: String(index) })
      .run();
    const registry = makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    });
    makeFanoutQueue({
      name: 'recovery',
      concurrency: 1,
      db,
      schema: testFanoutDbConfig.schema,
      entriesTableName: 'indexLog',
      indexColumnName: 'outboxIndex',
      subscribersTableName: 'subscribers',
      subscriberNameUtils: concurrencyNameUtils,
      key: { systemId: 'sys_test' },
      alarmRegistry: registry,
      getRepo: () =>
        Effect.succeed({
          recoverySubscriber: () =>
            Promise.resolve(
              new (class extends RpcTarget {
                async receive(delivery: {
                  rows: readonly { outboxIndex: number }[];
                }) {
                  delivered.push(...delivery.rows.map(row => row.outboxIndex));
                  return encodeSuccess(undefined);
                }
              })(),
            ),
        }),
    });
    expect(delivered).toHaveLength(index - 1);
    await Effect.runPromise(registry.run().pipe(Effect.provide(AsyncLive)));
    expect(
      db.select().from(testFanoutDbConfig.schema.subscribers).get()
        ?.currentIndex,
    ).toBe(index);
  }
  expect(delivered).toEqual([1, 2]);
});

it('owns 64-row paging for every production index column and keeps the complete log tip', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const props = {
    name: 'pages',
    db,
    schema: testFanoutDbConfig.schema,
    subscribersTableName: 'subscribers' satisfies 'subscribers',
    concurrency: 1,
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),
    getRepo: () => Effect.die('Paging must not resolve subscribers'),
  };
  const aggregateQueue = makeFanoutQueue({
    ...props,
    entriesTableName: 'aggregateLog',
    indexColumnName: 'aggregateIndex',
  });
  const serviceQueue = makeFanoutQueue({
    ...props,
    name: 'servicePages',
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
  });
  const finalizedQueue = makeFanoutQueue({
    ...props,
    name: 'finalizedPages',
    entriesTableName: 'indexLog',
    indexColumnName: 'outboxIndex',
  });
  for (const queue of [aggregateQueue, serviceQueue, finalizedQueue]) {
    expect(await queue.getPage({ afterIndex: 0 })).toEqual(
      encodeSuccess({ rows: [], lastIndex: 0 }),
    );
  }
  for (let index = 1; index <= 130; index++) {
    db.insert(testFanoutDbConfig.schema.aggregateLog)
      .values({ aggregateIndex: index, payload: `row ${index}` })
      .run();
    db.insert(testFanoutDbConfig.schema.fanoutLog)
      .values({ fanoutIndex: index, payload: `row ${index}` })
      .run();
    db.insert(testFanoutDbConfig.schema.indexLog)
      .values({ outboxIndex: index, payload: `row ${index}` })
      .run();
  }
  for (const queue of [aggregateQueue, serviceQueue, finalizedQueue]) {
    const page = await queue.getPage({ afterIndex: 0, maxIndex: 65 });
    expect(page).toMatchObject({
      _tag: 'Success',
      success: { lastIndex: 130 },
    });
    if (page._tag !== 'Success') throw new Error('Expected a page');
    expect(page.success.rows).toHaveLength(64);
    expect(page.success.rows.map(row => row.payload)).toEqual(
      Array.from({ length: 64 }, (_, index) => `row ${index + 1}`),
    );
    expect(await queue.getPage({ afterIndex: 0, maxIndex: 0 })).toEqual(
      encodeSuccess({ rows: [], lastIndex: 130 }),
    );
    expect(await queue.getPage({ afterIndex: 130 })).toEqual(
      encodeSuccess({ rows: [], lastIndex: 130 }),
    );
  }
  expect(
    await aggregateQueue.getPage({ afterIndex: 64, maxIndex: 65 }),
  ).toEqual(
    encodeSuccess({
      rows: [{ aggregateIndex: 65, payload: 'row 65' }],
      lastIndex: 130,
    }),
  );
  expect(await serviceQueue.getPage({ afterIndex: 64, maxIndex: 65 })).toEqual(
    encodeSuccess({
      rows: [{ fanoutIndex: 65, payload: 'row 65' }],
      lastIndex: 130,
    }),
  );
  expect(
    await finalizedQueue.getPage({ afterIndex: 64, maxIndex: 65 }),
  ).toEqual(
    encodeSuccess({
      rows: [{ outboxIndex: 65, payload: 'row 65' }],
      lastIndex: 130,
    }),
  );
});

it('schedules synchronous producers and retains recovery across an overlapping drain and restart', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: testFanoutDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const tables = testFanoutDbConfig.schema;
  db.insert(tables.subscribers)
    .values({
      subscriberRepoName: 'testsub_sys_test/acct_test/user',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      currentIndex: 0,
    })
    .run();
  const scheduled = Promise.withResolvers<void>();
  const scheduling = Promise.withResolvers<void>();
  const setAlarm = vi.fn(async () => {
    scheduling.resolve();
    await scheduled.promise;
  });
  const deleteAlarm = vi.fn(async () => undefined);
  const registry = makeAlarmRegistry({ storage: { setAlarm, deleteAlarm } });
  const receive = vi.fn(
    async (
      _delivery: IFanoutDelivery<{ fanoutIndex: number; payload: string }>,
    ) => encodeSuccess(undefined),
  );
  const props = {
    concurrency: 1,
    name: 'producer',
    db,
    schema: tables,
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscribersTableName: 'subscribers',
    subscriberNameUtils: concurrencyNameUtils,
    key: { systemId: 'sys_test' },
    alarmRegistry: registry,
    getRepo: () =>
      Effect.succeed({ producerSubscriber: async () => ({ receive }) }),
  };
  const queue = makeFanoutQueue({
    ...props,
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscribersTableName: 'subscribers',
  });
  const callback = vi.fn(() =>
    Effect.sync(() => {
      db.insert(tables.fanoutLog)
        .values({ fanoutIndex: 1, payload: 'retained' })
        .run();
      return 42;
    }),
  );
  const producer = Effect.runPromise(
    queue.drainAfter(callback).pipe(Effect.provide(AsyncLive)),
  );
  await scheduling.promise;
  expect(callback).not.toHaveBeenCalled();
  const oldDrain = queue.drain();
  scheduled.resolve();
  expect(await producer).toBe(42);
  await oldDrain;
  expect(deleteAlarm).not.toHaveBeenCalled();
  expect(receive).not.toHaveBeenCalled();

  const restartedRegistry = makeAlarmRegistry({
    storage: { setAlarm, deleteAlarm },
  });
  makeFanoutQueue({
    ...props,
    entriesTableName: 'fanoutLog',
    indexColumnName: 'fanoutIndex',
    subscribersTableName: 'subscribers',
    alarmRegistry: restartedRegistry,
  });
  await Effect.runPromise(
    restartedRegistry.run().pipe(Effect.provide(AsyncLive)),
  );
  expect(receive).toHaveBeenCalledWith({
    rows: [{ fanoutIndex: 1, payload: 'retained' }],
    lastIndex: 1,
  });
  expect(deleteAlarm).toHaveBeenCalled();

  // A producer must remain independent of a drain blocked on remote receipt.
  db.insert(tables.fanoutLog)
    .values({ fanoutIndex: 2, payload: 'second' })
    .run();
  const receiving = Promise.withResolvers<void>();
  const acknowledge = Promise.withResolvers<void>();
  receive.mockImplementationOnce(async () => {
    receiving.resolve();
    await acknowledge.promise;
    return encodeSuccess(undefined);
  });
  const delivering = queue.drain();
  await receiving.promise;
  deleteAlarm.mockClear();
  await Effect.runPromise(
    queue
      .drainAfter(() =>
        Effect.sync(() => {
          db.insert(tables.fanoutLog)
            .values({ fanoutIndex: 3, payload: 'third' })
            .run();
        }),
      )
      .pipe(Effect.provide(AsyncLive)),
  );
  acknowledge.resolve();
  await delivering;
  expect(deleteAlarm).not.toHaveBeenCalled();
  await Effect.runPromise(registry.run().pipe(Effect.provide(AsyncLive)));
  expect(receive).toHaveBeenLastCalledWith({
    rows: [{ fanoutIndex: 3, payload: 'third' }],
    lastIndex: 3,
  });

  expectTypeOf(
    queue.drainAfter(() => Effect.context<'producer-service'>()),
  ).toEqualTypeOf<
    Effect.Effect<
      Context.Context<'producer-service'>,
      IAnyError,
      'producer-service' | Async
    >
  >();

  const failure = new ZerospinError({
    code: 'producer-test',
    message: 'expected',
  });
  expect(
    await Effect.runPromise(
      queue
        .drainAfter(() => Effect.fail(failure))
        .pipe(Effect.flip, Effect.provide(AsyncLive)),
    ),
  ).toBe(failure);
  const resume = Promise.withResolvers<void>();
  const continued = vi.fn();
  const suspended = await Effect.runPromise(
    Effect.exit(
      queue.drainAfter(() =>
        Effect.promise(() => resume.promise).pipe(
          Effect.tap(() => Effect.sync(continued)),
        ),
      ),
    ).pipe(Effect.provide(AsyncLive)),
  );
  expect(suspended._tag).toBe('Failure');
  resume.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(continued).not.toHaveBeenCalled();
  setAlarm.mockRejectedValueOnce(new Error('scheduling failed'));
  callback.mockClear();
  await expect(
    Effect.runPromise(
      queue.drainAfter(callback).pipe(Effect.provide(AsyncLive)),
    ),
  ).rejects.toThrow('scheduling failed');
  expect(callback).not.toHaveBeenCalled();
  const interruptedScheduling = Promise.withResolvers<void>();
  const finishScheduling = Promise.withResolvers<void>();
  setAlarm.mockImplementationOnce(async () => {
    interruptedScheduling.resolve();
    await finishScheduling.promise;
  });
  const fiber = Effect.runFork(
    queue.drainAfter(callback).pipe(Effect.provide(AsyncLive)),
  );
  await interruptedScheduling.promise;
  await Effect.runPromise(Fiber.interrupt(fiber));
  finishScheduling.resolve();
  expect(callback).not.toHaveBeenCalled();
  deleteAlarm.mockClear();
  await queue.drain();
  expect(deleteAlarm).toHaveBeenCalled();

  // Type-only checks: constructing these lazy Effects does not execute them.
  // @ts-expect-error Async is forbidden in producer requirements.
  queue.drainAfter(() => makeAsync(async () => undefined));
  // @ts-expect-error A synchronous producer cannot return a Promise value.
  queue.drainAfter(() => Effect.succeed(Promise.resolve()));
});
