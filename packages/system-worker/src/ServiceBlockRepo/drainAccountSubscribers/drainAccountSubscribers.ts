import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, gt } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

export const drainAccountSubscribers = Effect.fn(
  'ServiceBlockRepo.drainAccountSubscribers',
)(function* (props: {
  db: IDb;
  storage: DurableObjectStorage;
  serviceName: string;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, serviceName, storage } = props;
  const now = Date.now();
  const subscribers = db
    .select()
    .from(serviceBlockDrizzleSchemas.accountSubscribers)
    .all();
  let nextAlarmAt: number | null = null;

  for (const subscriber of subscribers) {
    // A future retry remains durable work. Keep its exact deadline even though
    // this drain must not call the AccountRepo before that deadline is due.
    if (
      subscriber.nextRetryAt !== null &&
      subscriber.nextRetryAt > now
    ) {
      if (
        nextAlarmAt === null ||
        subscriber.nextRetryAt < nextAlarmAt
      ) {
        nextAlarmAt = subscriber.nextRetryAt;
      }
      continue;
    }
    const blockRows = db
      .select()
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .where(
        gt(
          serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
          subscriber.currentServiceIndex,
        ),
      )
      .orderBy(asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .all();
    if (blockRows.length === 0) {
      continue;
    }
    const blocks: IServiceBlock[] = [];
    for (const row of blockRows) {
      blocks.push(
        yield* Schema.decodeUnknown(Schema.parseJson(ServiceBlockSchema))(
          row.block,
        ).pipe(
          mapParseError({
            code: 'service-block-decode-failed',
            prefix: 'Failed to decode service block',
          }),
        ),
      );
    }
    const accountRepo = env.ACCOUNT_REPO.getByName(
      subscriber.accountRepoName,
    );
    let failedRetryAt: number | null = null;
    const delivered = yield* makeAsync<
      Schema.EitherEncoded<void, IAnyErrorJson>
    >(() => accountRepo.handleServiceBlocks({ serviceName, blocks })).pipe(
      Effect.flatMap(decodeRpc),
      Effect.as(true),
      Effect.catchAll(error =>
        Effect.sync(() => {
          const deliveryAttempts = subscriber.deliveryAttempts + 1;
          // Persist the same deadline that the final alarm scheduling step
          // observes so an early alarm cannot delete the pending retry.
          failedRetryAt =
            Date.now() + Math.min(10_000, 250 * 2 ** deliveryAttempts);
          db.update(serviceBlockDrizzleSchemas.accountSubscribers)
            .set({
              deliveryAttempts,
              nextRetryAt: failedRetryAt,
              lastDeliveryError: error.message,
            })
            .where(
              eq(
                serviceBlockDrizzleSchemas.accountSubscribers.accountRepoName,
                subscriber.accountRepoName,
              ),
            )
            .run();
          return false;
        }),
      ),
    );
    if (!delivered) {
      if (
        failedRetryAt !== null &&
        (nextAlarmAt === null || failedRetryAt < nextAlarmAt)
      ) {
        nextAlarmAt = failedRetryAt;
      }
      continue;
    }
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock === undefined) {
      continue;
    }
    db.update(serviceBlockDrizzleSchemas.accountSubscribers)
      .set({
        currentServiceCursor: lastBlock.lastServiceCursor,
        currentServiceIndex: lastBlock.serviceIndex,
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
      })
      .where(
        eq(
          serviceBlockDrizzleSchemas.accountSubscribers.accountRepoName,
          subscriber.accountRepoName,
        ),
      )
      .run();
  }

  if (nextAlarmAt !== null) {
    yield* Effect.promise(() => storage.setAlarm(nextAlarmAt));
  } else {
    yield* Effect.promise(() => storage.deleteAlarm());
  }
});
