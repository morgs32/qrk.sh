import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { IDb } from '@zerospin/core/drizzle/types';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import {
  encodeError,
  makeZerospinError,
  PublicFailureSchema,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import config from 'config';
import {
  and,
  asc,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lte,
  type InferSelectModel,
  type SQL,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Effect, References, Result, Schema, Semaphore } from 'effect';

import type { IAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';

export type IOutboxRepo<NAME extends string> = {
  readonly [K in NAME]: RpcTarget;
};

/** A single destination, durable table-backed delivery queue. */
/*
 * Repo owners construct a table-backed outbox with one bound receiver.
 * A serialized local drain delivers complete rows, acknowledges only the selected
 * page, and keeps an alarm lease until all pending rows are gone.
 *
 * 1. Serialize drains for this queue instance.
 * 2. Expose the durable pending check.
 * 3. Start a bounded or unbounded drain.
 * 4. Select the next pending page.
 * 5. Release only a fully empty queue.
 * 6. Retry delivery of the complete selected rows.
 * 7. Bind acknowledgement to exact page indices.
 * 8. Retain failed delivery for resumption.
 * 9. Acknowledge successful delivery.
 * 10. Return the local outbox instance.
 */
export const makeOutboxQueue = <
  NAME extends string,
  INDEX extends string,
  TABLE extends SQLiteTable &
    Record<INDEX, AnySQLiteColumn<{ data: number; notNull: boolean }>> & {
      acknowledgedAt: AnySQLiteColumn<{ data: Date | null; notNull: false }>;
      lastDeliveryFailure: AnySQLiteColumn<{
        data: string | null;
        notNull: false;
      }>;
    },
  ADDITIONAL_ROW = never,
>(props: {
  name: NAME;
  pageSize?: number;
  where?: SQL;
  db: IDb;
  outboxTable: TABLE;
  indexColumnName: INDEX;
  alarmRegistry: IAlarmRegistry;
  retention: 'retain' | 'delete';
  storage?: {
    hasPending(): boolean;
    readPage(
      throughIndex?: number,
    ): readonly { row: ADDITIONAL_ROW; index: number }[];
    recordFailure(indices: readonly number[], failure: string): void;
    acknowledge(
      indices: readonly number[],
      retention: 'retain' | 'delete',
    ): void;
  };
  deliver(
    rows: readonly (InferSelectModel<TABLE> | NoInfer<ADDITIONAL_ROW>)[],
  ): Effect.Effect<void, IAnyError | IZerospinErrorJson, Async>;
}) => {
  const {
    name,
    db,
    outboxTable,
    alarmRegistry,
    retention,
    deliver,
    indexColumnName,
    storage,
    pageSize = 64,
    where,
  } = props;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Invalid outbox page size');
  }

  const indexColumn = outboxTable[indexColumnName];

  // 1 — use one semaphore permit for delivery and acknowledgement
  const semaphore = Effect.runSync(Semaphore.make(1));
  let activeProducers = 0;
  let producerRevision = 0;

  class OutboxQueue extends RpcTarget {
    readonly name = name;
    declare readonly _outboxRow?: InferSelectModel<TABLE> | ADDITIONAL_ROW;

    /** Arm recovery before producing rows, then start delivery on every producer outcome.
     * Producers may prepare asynchronously and return without waiting for the receiver.
     */
    readonly drainAfter = <A, E, R>(callback: () => Effect.Effect<A, E, R>) => {
      return Effect.uninterruptibleMask(restore =>
        Effect.gen({ self: this }, function* () {
          activeProducers += 1;
          let started = false;
          return yield* restore(
            Effect.gen(function* () {
              yield* alarmRegistry.hold(name);
              started = true;
              return yield* Effect.suspend(callback);
            }),
          ).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                producerRevision += 1;
                activeProducers -= 1;
                if (started) {
                  const delivery = config.system.runtime.runPromise(
                    this.drain().pipe(Effect.provide(AsyncLive)),
                  );
                  void delivery.catch(() => undefined);
                }
              }),
            ),
          );
        }),
      );
    };

    // 2 — look for one row with acknowledgedAt null
    readonly hasPending = Effect.fn(`${name}.hasPending`)(function* () {
      yield* Effect.void;
      if (storage !== undefined) return storage.hasPending();
      return (
        db
          .select({ index: indexColumn })
          .from(outboxTable)
          .where(
            and(
              where,
              isNotNull(indexColumn),
              isNull(outboxTable.acknowledgedAt),
            ),
          )
          .limit(1)
          .get() !== undefined
      );
    });

    // 3 — hold the queue-specific alarm lease
    readonly drain = Effect.fn(`${name}.drain`)((throughIndex?: number) =>
      semaphore.withPermits(1)(
        Effect.gen({ self: this }, function* () {
          const revision = producerRevision;
          yield* alarmRegistry.hold(name);
          while (true) {
            // 4 — read up to 64 ascending rows, optionally bounded by throughIndex
            const rows =
              storage !== undefined
                ? storage.readPage(throughIndex)
                : db
                    .select({
                      row: getTableColumns(outboxTable),
                      index: indexColumn,
                    })
                    .from(outboxTable)
                    .where(
                      and(
                        where,
                        isNotNull(indexColumn),
                        isNull(outboxTable.acknowledgedAt),
                        throughIndex === undefined
                          ? undefined
                          : lte(indexColumn, throughIndex),
                      ),
                    )
                    .orderBy(asc(indexColumn))
                    .limit(pageSize)
                    .all();

            // 5 — keep the lease if pending rows exist beyond the requested bound
            if (rows.length === 0) {
              if (!(yield* this.hasPending())) {
                // An overlapping producer owns the wakeup even before its rows exist.
                yield* Effect.suspend(() =>
                  activeProducers === 0 && producerRevision === revision
                    ? alarmRegistry.release(name)
                    : Effect.void,
                ).pipe(
                  Effect.provideService(References.PreventSchedulerYield, true),
                );
              }
              return;
            }

            // 6 — settle the bound receiver call using defaultRetrySchedule
            const delivered = yield* deliver(rows.map(entry => entry.row)).pipe(
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.result,
            );

            // 7 — use the captured index set so concurrent appends are untouched
            const page = and(
              where,
              inArray(
                indexColumn,
                rows.map(row => row.index),
              ),
            );

            // 8 — write lastDeliveryFailure on the page and return the failure
            if (Result.isFailure(delivered)) {
              const failure = makeZerospinError(delivered.failure);
              const encodedFailure = Schema.encodeSync(
                Schema.fromJsonString(PublicFailureSchema),
              )(yield* encodeError(failure));
              if (storage !== undefined) {
                storage.recordFailure(
                  rows.map(row => row.index),
                  encodedFailure,
                );
              } else {
                db.update<SQLiteTable>(outboxTable)
                  .set({
                    lastDeliveryFailure: encodedFailure,
                  })
                  .where(page)
                  .run();
              }
              return yield* Effect.fail(failure);
            }

            // 9 — delete the exact page or retain it with acknowledgedAt and cleared failure
            if (storage !== undefined) {
              storage.acknowledge(
                rows.map(row => row.index),
                retention,
              );
            } else if (retention === 'delete') {
              db.delete(outboxTable).where(page).run();
            } else {
              db.update<SQLiteTable>(outboxTable)
                .set({ acknowledgedAt: new Date(), lastDeliveryFailure: null })
                .where(page)
                .run();
            }
          }
        }),
      ),
    );
  }

  // 10 — bind the delivery policy and database for the owner getter
  const queue = new OutboxQueue();
  alarmRegistry.register(name, queue.drain());
  return queue;
};
