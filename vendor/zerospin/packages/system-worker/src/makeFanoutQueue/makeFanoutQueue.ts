import type { MatchParams } from '@remix-run/route-pattern/match';
import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  stringifyZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeRpcEnvelope, type IRpcEnvelope } from '@zerospin/logger';
import { RpcTarget } from 'capnweb';
import config from 'config';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  isNull,
  lt,
  lte,
  sql,
  type Column,
  type InferSelectModel,
  type SQL,
  type Table,
} from 'drizzle-orm';
import {
  getTableConfig,
  type AnySQLiteColumn,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import {
  Cause,
  Effect,
  Exit,
  Queue,
  References,
  Result,
  Semaphore,
} from 'effect';

import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import type { IRepoNameUtils } from '../makeDORepo/makeRepoNameUtils.js';

export type IFanoutDelivery<ROW> = {
  rows: readonly ROW[];
  lastIndex: number;
};

export type IFanoutQueue<
  NAME extends string = string,
  PATTERN extends string = string,
  ROW = unknown,
> = RpcTarget & {
  readonly name: NAME;
  /** Type-only carriers; never assigned at runtime. */
  readonly _fanoutRow?: ROW;
  readonly _subscribePattern?: PATTERN;
  /** Starts delivery immediately; callers may await completion or ignore it. */
  readonly drain: () => Promise<void>;
  /** Arm recovery before a synchronous producer, then start background delivery. */
  readonly drainAfter: <A, E, R>(
    callback: (() => Effect.Effect<A, E, R>) &
      ([Extract<R, Async>] extends [never] ? unknown : never) &
      ([Extract<A, PromiseLike<unknown>>] extends [never] ? unknown : never),
  ) => Effect.Effect<A, E | IAnyError, R | Async>;
  getPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<IRpcEnvelope<IFanoutDelivery<ROW>, IZerospinErrorJson>>;
  subscribe(
    props: MatchParams<PATTERN> & { currentIndex: number | null },
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
};

export type IFanoutQueueRow<
  QUEUE extends IFanoutQueue<string, string, unknown>,
> = NonNullable<QUEUE['_fanoutRow']>;

/**
 * Owner names the queue getter and requires its receiver capability. Subscribe props are typed on the queue
 * instance (`MatchParams` + `currentIndex`), not on this marker.
 */
export type IFanoutRepo<
  FANOUT_QUEUE_NAME extends string,
  _SUBSCRIBER extends IFanoutSubscriberRepo<{
    readonly name: FANOUT_QUEUE_NAME;
  }>,
> = {
  readonly [K in FANOUT_QUEUE_NAME]: RpcTarget;
};

export type IFanoutSubscriberRepo<QUEUE extends { readonly name: string }> = {
  readonly [K in `${QUEUE['name']}Subscriber`]: (
    sourceKey: never,
  ) => RpcTarget & {
    receive(
      delivery: IFanoutDelivery<unknown>,
    ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  };
};

const readSubscriberIdColumn = (subscriberTable: Table): Column => {
  const tableConfig = getTableConfig(subscriberTable as never);
  const primaryColumns = tableConfig.columns.filter(column => column.primary);
  if (primaryColumns.length === 1) {
    return primaryColumns[0]!;
  }
  if (
    primaryColumns.length === 0 &&
    tableConfig.primaryKeys.length === 1 &&
    tableConfig.primaryKeys[0]!.columns.length === 1
  ) {
    return tableConfig.primaryKeys[0]!.columns[0]!;
  }
  throw makeZerospinError({
    code: 'fanout-subscriber-primary-key-ambiguous',
    message: `Fanout subscriber table must have exactly one primary-key column`,
  });
};

/*
 * Repo queue getters bind durable fanout to named schema tables and an index column.
 * Serialized drains keep selecting the oldest unfailed, nonpending subscribers.
 * Successful pages advance their entire suffix; persisted failures are terminal.
 *
 * 1. Validate delivery concurrency.
 * 2. Bind serialization, the known index, and subscriber identity.
 * 3. Query the oldest eligible subscribers up to the available delivery slots.
 * 4. Persist successful acknowledgements.
 * 5. Validate enrollment without resetting terminal failures.
 * 6. Read the persisted tip before acquiring the drain lock.
 * 7. Hold the alarm and create scoped delivery state.
 * 8. Reuse or refill the suffix for each selected subscriber.
 * 9. Deliver concurrently and persist progress or terminal failure.
 * 10. Refill on completion; release the alarm once work settles.
 * 11. Enroll atomically without the drain lock, then start delivery.
 * 12. Return the bound fanout capability.
 */
export const makeFanoutQueue = <
  NAME extends string,
  PATTERN extends string,
  SOURCE_KEY extends Readonly<Record<string, string>>,
  SUBSCRIBERS_TABLE_NAME extends string,
  ENTRIES_TABLE_NAME extends string,
  INDEX_COLUMN_NAME extends string,
  SCHEMA extends Record<
    SUBSCRIBERS_TABLE_NAME,
    SQLiteTable & {
      readonly currentIndex: AnySQLiteColumn<{
        data: number | null;
        notNull: false;
      }>;
      readonly failure: AnySQLiteColumn<{
        data: string | null;
        notNull: false;
      }>;
    }
  > &
    Record<
      ENTRIES_TABLE_NAME,
      SQLiteTable &
        Record<
          INDEX_COLUMN_NAME,
          AnySQLiteColumn<{ data: number; notNull: true }>
        >
    >,
  ADDITIONAL_ROW = never,
>(props: {
  name: NAME;
  alarmRegistry: IAlarmRegistry;
  db: IDb;
  schema: SCHEMA;
  subscribersTableName: SUBSCRIBERS_TABLE_NAME;
  entriesTableName: ENTRIES_TABLE_NAME;
  indexColumnName: INDEX_COLUMN_NAME;
  readPage?: (page: { afterIndex: number; maxIndex?: number }) => {
    rows: readonly { row: ADDITIONAL_ROW; index: number }[];
    lastIndex: number;
  };
  /** Subscriber page size and simultaneous deliveries; a positive integer. */
  concurrency: number;
  /** Additional predicates ANDed with queue eligibility before the page limit. */
  subscribersWhere?: readonly [SQL | undefined, ...(SQL | undefined)[]];
  subscriberNameUtils: IRepoNameUtils<PATTERN>;
  /** Owner identity; only fields also present on subscribe params are checked. */
  key: SOURCE_KEY;
  getRepo: (props: { key: MatchParams<NoInfer<PATTERN>> }) => Effect.Effect<
    {
      readonly [K in `${NoInfer<NAME>}Subscriber`]: (
        sourceKey: NoInfer<SOURCE_KEY>,
      ) => PromiseLike<{
        receive(
          delivery: IFanoutDelivery<
            | InferSelectModel<NoInfer<SCHEMA[ENTRIES_TABLE_NAME]>>
            | NoInfer<ADDITIONAL_ROW>
          >,
        ): PromiseLike<IRpcEnvelope<void, IZerospinErrorJson>>;
      }>;
    },
    IAnyError | IZerospinErrorJson,
    Async
  >;
}): IFanoutQueue<
  NAME,
  PATTERN,
  InferSelectModel<SCHEMA[ENTRIES_TABLE_NAME]> | ADDITIONAL_ROW
> => {
  type SUBSCRIBER = InferSelectModel<SCHEMA[SUBSCRIBERS_TABLE_NAME]> & {
    readonly currentIndex: number | null;
  };
  const {
    name,
    alarmRegistry,
    db,
    schema,
    entriesTableName,
    indexColumnName,
    getRepo,
    concurrency,
    subscribersTableName,
    subscribersWhere = [],
    subscriberNameUtils,
    key,
    readPage,
  } = props;

  const subscriberTable = schema[subscribersTableName];
  const entriesTable = schema[entriesTableName];
  const indexColumn = entriesTable[indexColumnName];

  // Keep the query index alongside the complete row without rebuilding its payload.
  const getSuffix = Effect.fn(`${name}.getSuffix`)(function* (page: {
    afterIndex: number;
    maxIndex?: number;
  }) {
    yield* Effect.void;
    if (readPage !== undefined) return readPage(page);
    return {
      rows: db
        .select({ row: getTableColumns(entriesTable), index: indexColumn })
        .from(entriesTable)
        .where(
          and(
            gt(indexColumn, page.afterIndex),
            page.maxIndex === undefined
              ? undefined
              : lte(indexColumn, page.maxIndex),
          ),
        )
        .orderBy(asc(indexColumn))
        .limit(64)
        .all(),
      lastIndex:
        db
          .select({ index: indexColumn })
          .from(entriesTable)
          .orderBy(desc(indexColumn))
          .limit(1)
          .get()?.index ?? 0,
    };
  });

  // 1 — require a positive integer page size before constructing queue state
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw makeZerospinError({
      code: 'fanout-concurrency-invalid',
      message: 'Fanout concurrency must be a positive integer',
    });
  }

  // 2 — find the single primary key and normalize null cursors to zero
  const semaphore = Semaphore.makeUnsafe(1);
  let lastIndex = 0;
  let activeProducers = 0;
  let producerRevision = 0;
  const subscriberIdColumn = readSubscriberIdColumn(subscriberTable);
  const idColumnName = subscriberIdColumn.name;
  const subscriberColumns = getTableColumns(subscriberTable);
  const subscriberProperty: `${NAME}Subscriber` = `${name}Subscriber`;

  const currentIndex = sql<number>`coalesce(${subscriberTable.currentIndex}, 0)`;

  // 3 — exclude pending IDs before LIMIT; acknowledgements reorder the next query
  const getSubscribers = (
    lastIndex: number,
    pending: ReadonlySet<unknown>,
  ): SUBSCRIBER[] =>
    db
      .select()
      .from(subscriberTable as never)
      .where(
        and(
          ...subscribersWhere,
          isNull(subscriberTable.failure),
          lt(currentIndex, lastIndex),
          // One JSON array avoids SQLite's bind-parameter limit at high concurrency.
          pending.size === 0
            ? undefined
            : sql`${subscriberIdColumn} not in (select value from json_each(${JSON.stringify([...pending])}))`,
        ),
      )
      .orderBy(asc(currentIndex), asc(subscriberIdColumn))
      .limit(concurrency - pending.size)
      .all() as SUBSCRIBER[];

  // 4 — advance only the acknowledged cursor; terminal failures are never cleared
  const setCurrentIndex = (
    subscriber: SUBSCRIBER,
    index: number,
  ): Effect.Effect<void, IAnyError, Async> =>
    Effect.sync(() => {
      const id = (subscriber as Record<string, unknown>)[idColumnName];
      db.update(subscriberTable as never)
        .set({
          currentIndex: sql`max(coalesce(${subscriberTable.currentIndex}, 0), ${index})`,
        } as never)
        .where(eq(subscriberIdColumn, id as never))
        .run();
    });

  // 5 — compare shared owner key fields, encode the name, and advance enrollment
  const enroll = (
    subscribeProps: MatchParams<PATTERN> & {
      currentIndex: number | null;
    },
  ): Effect.Effect<void, IAnyError, Async> =>
    Effect.gen(function* () {
      const { currentIndex, ...params } = subscribeProps;
      for (const [field, expected] of Object.entries(key)) {
        if (!(field in params)) {
          continue;
        }
        if ((params as Record<string, string>)[field] !== expected) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'fanout-subscriber-target-mismatch',
              message: `Fanout subscriber key.${field} does not belong to this owner`,
            }),
          );
        }
      }
      const subscriberName = yield* subscriberNameUtils.makeName(
        params as never,
      );
      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            const existing = tx
              .select({ failure: subscriberTable.failure })
              .from(subscriberTable as never)
              .where(eq(subscriberIdColumn, subscriberName as never))
              .get();
            if (existing !== undefined) {
              if (existing.failure !== null) {
                throw makeZerospinError({
                  code: 'fanout-subscriber-failed',
                  message: `Fanout subscriber ${subscriberName} has a terminal failure`,
                  cause: String(existing.failure),
                });
              }
              tx.update(subscriberTable as never)
                .set({
                  currentIndex: sql`max(coalesce(${subscriberTable.currentIndex}, 0), ${currentIndex ?? 0})`,
                } as never)
                .where(eq(subscriberIdColumn, subscriberName as never))
                .run();
              return;
            }
            const fragments: Record<string, unknown> = {};
            for (const [field, value] of Object.entries(params)) {
              if (field in subscriberColumns) {
                fragments[field] = value;
              }
            }
            tx.insert(subscriberTable as never)
              .values({
                [idColumnName]: subscriberName,
                currentIndex,
                failure: null,
                ...fragments,
              } as never)
              .run();
          }),
        catch: cause =>
          isZerospinError(cause)
            ? cause
            : makeZerospinError({
                code: 'fanout-subscriber-enroll-failed',
                message: `Failed to enroll fanout subscriber ${subscriberName}`,
                cause: prettyUnknownFailure(cause),
              }),
      });
    });

  class FanoutQueue extends RpcTarget {
    name: NAME;
    readonly drain: () => Promise<void>;
    readonly drainAfter: IFanoutQueue['drainAfter'] = <A, E, R>(
      callback: () => Effect.Effect<A, E, R>,
    ) => {
      return Effect.uninterruptibleMask(restore =>
        Effect.gen({ self: this }, function* () {
          activeProducers += 1;
          let started = false;
          return yield* restore(
            Effect.gen(function* () {
              yield* alarmRegistry.hold(name);
              started = true;
              const context = yield* Effect.context<R>();
              const exit = Effect.runSyncExitWith(context)(
                Effect.suspend(callback),
              );
              if (Exit.isFailure(exit)) {
                // A suspended synchronous runner must never resume producer writes.
                for (const reason of exit.cause.reasons) {
                  if (
                    Cause.isDieReason(reason) &&
                    Cause.isAsyncFiberError(reason.defect)
                  ) {
                    reason.defect.fiber.interruptUnsafe();
                    reason.defect.fiber.currentDispatcher.flush();
                  }
                }
                return yield* Effect.failCause(exit.cause);
              }
              return exit.value;
            }),
          ).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                producerRevision += 1;
                activeProducers -= 1;
                if (started) this.drain();
              }),
            ),
          );
        }),
      );
    };

    constructor() {
      super();
      this.name = name;
      const drain = Effect.fn(`${name}.drain`)(function* () {
        const revision = producerRevision;
        // 6 — newer calls extend active work before waiting for the shared lock
        lastIndex = Math.max(
          lastIndex,
          readPage === undefined
            ? (db
                .select({ index: indexColumn })
                .from(entriesTable)
                .orderBy(desc(indexColumn))
                .limit(1)
                .get()?.index ?? 0)
            : (yield* getSuffix({ afterIndex: 0, maxIndex: 0 })).lastIndex,
        );
        return yield* Effect.gen(function* () {
          // 7 — scoped children cannot outlive the serialized drain
          yield* alarmRegistry.hold(name);
          const pending = new Set<unknown>();
          const completions = yield* Queue.make<{
            id: unknown;
            exit: Exit.Exit<void, IAnyError>;
          }>();
          let rows: Effect.Success<ReturnType<typeof getSuffix>>['rows'] = [];
          let pageLastIndex = 0;
          let afterIndex = 0;
          let maxIndex = 0;
          let unavailableAfter = Infinity;
          let firstFailure: IAnyError | undefined;

          for (;;) {
            const subscribers =
              pending.size < concurrency
                ? getSubscribers(Math.min(lastIndex, unavailableAfter), pending)
                : [];
            for (const subscriber of subscribers) {
              const cursor = subscriber.currentIndex ?? 0;
              if (cursor >= unavailableAfter) break;

              // 8 — an older subscriber or an exhausted page requires a new suffix
              if (cursor < afterIndex || cursor >= maxIndex) {
                afterIndex = cursor;
                const page = yield* getSuffix({
                  afterIndex: cursor,
                  maxIndex: lastIndex,
                });
                rows = page.rows.filter(row => row.index <= lastIndex);
                pageLastIndex = page.lastIndex;
                const last = rows.at(-1);
                if (last === undefined) {
                  // A later wakeup may expose finalized rows without increasing lastIndex.
                  unavailableAfter = cursor;
                  maxIndex = cursor;
                  break;
                }
                maxIndex = last.index;
              }
              const delivery = {
                rows: rows
                  .filter(row => row.index > cursor)
                  .map(entry => entry.row),
                lastIndex: pageLastIndex,
              };
              const deliveredThrough = maxIndex;
              const id = (subscriber as Record<string, unknown>)[idColumnName];
              pending.add(id);

              // 9 — keep this row slice and pending identity until persistence settles
              yield* Effect.gen(function* () {
                const result = yield* Effect.gen(function* () {
                  if (typeof id !== 'string') {
                    return yield* Effect.fail(
                      makeZerospinError({
                        code: 'fanout-subscriber-name-invalid',
                        message:
                          'Fanout subscriber primary key must be a Repo name',
                      }),
                    );
                  }
                  const subscriberKey =
                    yield* subscriberNameUtils.parseName(id);
                  const repo = yield* getRepo({ key: subscriberKey });
                  const receiver = yield* makeAsync(() =>
                    repo[subscriberProperty](key),
                  );
                  yield* makeAsync(() => receiver.receive(delivery)).pipe(
                    Effect.flatMap(envelope => readRpcEnvelope(envelope)),
                  );
                  yield* setCurrentIndex(subscriber, deliveredThrough);
                }).pipe(
                  Effect.catchDefect(cause =>
                    Effect.fail(
                      makeZerospinError({
                        code: 'fanout-subscriber-delivery-defect',
                        message:
                          'Fanout subscriber delivery or acknowledgement threw',
                        cause: prettyUnknownFailure(cause),
                      }),
                    ),
                  ),
                  Effect.result,
                );
                if (Result.isFailure(result)) {
                  const failure = makeZerospinError(result.failure);
                  const encodedFailure = JSON.stringify(
                    yield* encodeError(failure),
                  );
                  yield* Effect.try({
                    try: () =>
                      db
                        .update(subscriberTable as never)
                        .set({
                          failure: encodedFailure,
                        } as never)
                        .where(eq(subscriberIdColumn, id))
                        .run(),
                    catch: cause =>
                      makeZerospinError({
                        code: 'fanout-subscriber-failure-persist-failed',
                        message:
                          'Failed to persist terminal fanout subscriber failure',
                        cause: `${stringifyZerospinError(failure)}\n${prettyUnknownFailure(cause)}`,
                      }),
                  });
                  firstFailure ??= failure;
                }
              }).pipe(
                Effect.onExit(exit => Queue.offer(completions, { id, exit })),
                Effect.forkScoped,
              );
            }

            // 10 — consume completions before reselecting; persistence failure aborts
            if (pending.size === 0) break;
            for (const completion of yield* Queue.takeAll(completions)) {
              if (Exit.isFailure(completion.exit)) {
                return yield* Effect.failCause(completion.exit.cause);
              }
              pending.delete(completion.id);
            }
          }
          // Do not clear a wakeup scheduled by a producer overlapping this drain.
          yield* Effect.suspend(() =>
            activeProducers === 0 && producerRevision === revision
              ? alarmRegistry.release(name)
              : Effect.void,
          ).pipe(Effect.provideService(References.PreventSchedulerYield, true));
          if (firstFailure !== undefined) {
            return yield* Effect.fail(firstFailure);
          }
        }).pipe(Effect.scoped, semaphore.withPermits(1));
      });
      alarmRegistry.register(name, drain());
      this.drain = () => {
        const promise = config.system.runtime.runPromise(
          drain().pipe(Effect.provide(AsyncLive)),
        );
        // Observe background rejection without changing what awaiting callers see.
        void promise.catch(() => undefined);
        return promise;
      };
    }

    async getPage(pageProps: { afterIndex: number; maxIndex?: number }) {
      return config.system.runtime.runPromise(
        getSuffix(pageProps).pipe(
          Effect.map(page => ({
            rows: page.rows.map(entry => entry.row),
            lastIndex: page.lastIndex,
          })),
          Effect.provide(AsyncLive),
          makeRpcEnvelope,
        ),
      );
    }

    async subscribe(
      subscribeProps: MatchParams<PATTERN> & { currentIndex: number | null },
    ) {
      // 11 — enrollment must not wait for a drain awaiting this receiver's activation.
      const result = await config.system.runtime.runPromise(
        Effect.gen(function* () {
          // Retain recovery before committing enrollment. Local cursor writes are
          // synchronous and monotonic, including acknowledgements already in flight.
          yield* alarmRegistry.hold(name);
          yield* enroll(subscribeProps);
        }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
      );
      if (result.result._tag === 'Success') {
        this.drain();
      }
      return result;
    }
  }

  // 12 — expose name, typed subscribe arguments, and the immediately started drain
  return new FanoutQueue() as IFanoutQueue<
    NAME,
    PATTERN,
    InferSelectModel<SCHEMA[ENTRIES_TABLE_NAME]> | ADDITIONAL_ROW
  >;
};
