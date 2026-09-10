import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import type { IAnyError } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import {
  and,
  asc,
  getTableColumns,
  inArray,
  isNull,
  lte,
  type InferSelectModel,
} from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { Effect, Result, Semaphore } from 'effect';

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
  TABLE extends SQLiteTable & {
    outboxIndex: AnySQLiteColumn<{ data: number; notNull: true }>;
    deliveredAt: AnySQLiteColumn<{ data: Date | null; notNull: false }>;
    lastDeliveryFailure: AnySQLiteColumn<{
      data: string | null;
      notNull: false;
    }>;
  },
>(props: {
  name: NAME;
  db: IDb;
  outboxTable: TABLE;
  alarmRegistry: IAlarmRegistry;
  retention: 'retain' | 'delete';
  deliver(
    rows: readonly InferSelectModel<TABLE>[],
  ): Effect.Effect<void, IAnyError, Async>;
}) => {
  const { name, db, outboxTable, alarmRegistry, retention, deliver } = props;

  // 1 — use one semaphore permit for delivery and acknowledgement
  const semaphore = Effect.runSync(Semaphore.make(1));

  class OutboxQueue extends RpcTarget {
    readonly name = name;
    declare readonly _outboxRow?: InferSelectModel<TABLE>;

    // 2 — look for one row with deliveredAt null
    readonly hasPending = Effect.fn(`${name}.hasPending`)(function* () {
      yield* Effect.void;
      return (
        db
          .select({ outboxIndex: outboxTable.outboxIndex })
          .from(outboxTable)
          .where(isNull(outboxTable.deliveredAt))
          .limit(1)
          .get() !== undefined
      );
    });

    // 3 — hold the queue-specific alarm lease
    readonly drain = Effect.fn(`${name}.drain`)((throughIndex?: number) =>
      semaphore.withPermits(1)(
        Effect.gen({ self: this }, function* () {
          yield* alarmRegistry.hold(name);
          while (true) {
            // 4 — read up to 64 ascending rows, optionally bounded by throughIndex
            const rows = db
              .select({
                row: getTableColumns(outboxTable),
                outboxIndex: outboxTable.outboxIndex,
              })
              .from(outboxTable)
              .where(
                and(
                  isNull(outboxTable.deliveredAt),
                  throughIndex === undefined
                    ? undefined
                    : lte(outboxTable.outboxIndex, throughIndex),
                ),
              )
              .orderBy(asc(outboxTable.outboxIndex))
              .limit(64)
              .all();

            // 5 — keep the lease if pending rows exist beyond the requested bound
            if (rows.length === 0) {
              if (!(yield* this.hasPending())) {
                yield* alarmRegistry.release(name);
              }
              return;
            }

            // 6 — settle the bound receiver call using defaultRetrySchedule
            const delivered = yield* deliver(rows.map(entry => entry.row)).pipe(
              Effect.retry({ schedule: defaultRetrySchedule }),
              Effect.result,
            );

            // 7 — use the captured outboxIndex set so concurrent appends are untouched
            const page = inArray(
              outboxTable.outboxIndex,
              rows.map(row => row.outboxIndex),
            );

            // 8 — write lastDeliveryFailure on the page and return the failure
            if (Result.isFailure(delivered)) {
              db.update<SQLiteTable>(outboxTable)
                .set({ lastDeliveryFailure: delivered.failure.message })
                .where(page)
                .run();
              return yield* delivered.failure;
            }

            // 9 — delete the exact page or retain it with deliveredAt and cleared failure
            if (retention === 'delete') {
              db.delete(outboxTable).where(page).run();
            } else {
              db.update<SQLiteTable>(outboxTable)
                .set({ deliveredAt: new Date(), lastDeliveryFailure: null })
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
