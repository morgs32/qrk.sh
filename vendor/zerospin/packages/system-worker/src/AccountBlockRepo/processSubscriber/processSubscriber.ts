/*
 * System-worker annotation:
 * Claims and delivers one AccountBlockRepo subscriber queue item.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTraceableRpcTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';
import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

export const processSubscriber = Effect.fn(
  'AccountBlockRepo.processSubscriber',
)(function* (props: {
  db: IDb;
  storage: DurableObjectStorage;
  subscriberDelivery: Effect.Effect.Success<
    ReturnType<typeof refreshQueue>
  >[number];
}): Effect.fn.Return<number | null, IAnyError, Async | TelemetryCollector> {
  const { db, storage, subscriberDelivery } = props;
  const lastBlock =
    subscriberDelivery.blocks[subscriberDelivery.blocks.length - 1];
  if (lastBlock === undefined) {
    return null;
  }

  const subscriber = subscriberDelivery.subscriber;
  const currentAccountCursorMatch =
    subscriber.currentAccountCursor === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.currentAccountCursor)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.currentAccountCursor,
          subscriber.currentAccountCursor,
        );
  const currentAccountIndexMatch =
    subscriber.currentAccountIndex === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.currentAccountIndex)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.currentAccountIndex,
          subscriber.currentAccountIndex,
        );
  const queuedAccountCursorMatch =
    subscriber.queuedAccountCursor === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.queuedAccountCursor)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.queuedAccountCursor,
          subscriber.queuedAccountCursor,
        );
  const queuedAccountIndexMatch =
    subscriber.queuedAccountIndex === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.queuedAccountIndex)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.queuedAccountIndex,
          subscriber.queuedAccountIndex,
        );
  const subscriberSnapshotMatch = and(
    eq(
      accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
      subscriber.actorRepoName,
    ),
    eq(
      accountBlockDrizzleSchemas.actorSubscribers.accountId,
      subscriber.accountId,
    ),
    eq(
      accountBlockDrizzleSchemas.actorSubscribers.accountName,
      subscriber.accountName,
    ),
    eq(accountBlockDrizzleSchemas.actorSubscribers.actorId, subscriber.actorId),
    eq(
      accountBlockDrizzleSchemas.actorSubscribers.actorName,
      subscriber.actorName,
    ),
    currentAccountCursorMatch,
    currentAccountIndexMatch,
    queuedAccountCursorMatch,
    queuedAccountIndexMatch,
  );

  let claimedQueuedAccountCursor = subscriber.queuedAccountCursor;
  let claimedQueuedAccountIndex = subscriber.queuedAccountIndex;
  if (
    claimedQueuedAccountIndex === null ||
    claimedQueuedAccountIndex < lastBlock.accountIndex ||
    claimedQueuedAccountCursor !== lastBlock.lastAccountCursor
  ) {
    claimedQueuedAccountCursor = lastBlock.lastAccountCursor;
    claimedQueuedAccountIndex = lastBlock.accountIndex;
    db.update(accountBlockDrizzleSchemas.actorSubscribers)
      .set({
        queuedAccountCursor: claimedQueuedAccountCursor,
        queuedAccountIndex: claimedQueuedAccountIndex,
      })
      .where(subscriberSnapshotMatch)
      .run();
  }

  const claimedQueuedAccountCursorMatch =
    claimedQueuedAccountCursor === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.queuedAccountCursor)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.queuedAccountCursor,
          claimedQueuedAccountCursor,
        );
  const claimedQueuedAccountIndexMatch =
    claimedQueuedAccountIndex === null
      ? isNull(accountBlockDrizzleSchemas.actorSubscribers.queuedAccountIndex)
      : eq(
          accountBlockDrizzleSchemas.actorSubscribers.queuedAccountIndex,
          claimedQueuedAccountIndex,
        );
  const claimedSubscriberMatch = and(
    eq(
      accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
      subscriber.actorRepoName,
    ),
    currentAccountCursorMatch,
    currentAccountIndexMatch,
    claimedQueuedAccountCursorMatch,
    claimedQueuedAccountIndexMatch,
  );
  const claimedSubscriber = db
    .select({
      actorRepoName:
        accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
    })
    .from(accountBlockDrizzleSchemas.actorSubscribers)
    .where(claimedSubscriberMatch)
    .get();
  if (claimedSubscriber === undefined) {
    return null;
  }

  const actorRepo = env.ACTOR_REPO.getByName(subscriber.actorRepoName);
  const tracedActorRepo = makeTraceableRpcTarget(actorRepo);

  const retryAt = yield* tracedActorRepo
    .handleAccountBlocks(subscriberDelivery.blocks)
    .pipe(
      Effect.mapError(errorJson =>
        errorJson instanceof Error
          ? new ZerospinError({
              code: 'actor-block-delivery-rpc-failed',
              message: errorJson.message,
              cause: ZerospinError.prettyUnknownFailure(errorJson),
            })
          : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
      ),
      Effect.as(null),
      Effect.catchAll(error =>
        Effect.gen(function* () {
          const span = yield* Effect.currentSpan.pipe(Effect.orDie);
          yield* makeAsync(() =>
            storage.put('telemetryAlarmRetryOf', {
              traceId: span.traceId,
              spanId: span.spanId,
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
          const nextAttempt = subscriber.deliveryAttempts + 1;
          const nextRetryAt =
            Date.now() + Math.min(10_000, 250 * 2 ** nextAttempt);
          db.update(accountBlockDrizzleSchemas.actorSubscribers)
            .set({
              deliveryAttempts: nextAttempt,
              nextRetryAt,
              lastDeliveryError:
                error instanceof Error ? error.message : String(error),
              failedAt: Date.now(),
            })
            .where(claimedSubscriberMatch)
            .run();
          return nextRetryAt;
        }),
      ),
    );

  if (retryAt !== null) {
    return retryAt;
  }

  db.update(accountBlockDrizzleSchemas.actorSubscribers)
    .set({
      currentAccountCursor: lastBlock.lastAccountCursor,
      currentAccountIndex: lastBlock.accountIndex,
      queuedAccountCursor: lastBlock.lastAccountCursor,
      queuedAccountIndex: lastBlock.accountIndex,
      deliveryAttempts: 0,
      nextRetryAt: null,
      lastDeliveryError: null,
      failedAt: null,
      succeededAt: Date.now(),
    })
    .where(claimedSubscriberMatch)
    .run();
  return null;
});
