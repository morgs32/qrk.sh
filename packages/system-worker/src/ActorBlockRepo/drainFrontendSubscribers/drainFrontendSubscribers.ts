import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlock } from '../../types.js';
import { actorBlockDrizzleSchemas } from '../ActorBlockRepo.js';

export const drainFrontendSubscribers = Effect.fn(
  'ActorBlockRepo.drainFrontendSubscribers',
)(function* (props: {
  db: IDb;
  storage: DurableObjectStorage;
  forceRetryNow: boolean;
  inspectionOnly: boolean;
}): Effect.fn.Return<
  Readonly<{ pendingFrontendSubscriberCount: number }>,
  IAnyError,
  Async
> {
  const { db, forceRetryNow, inspectionOnly, storage } = props;
  const now = Date.now();
  const subscribers = db
    .select()
    .from(actorBlockDrizzleSchemas.frontendSubscribers)
    .all();

  // A forced self-hosted generation drain is inspection-only. Ordinary
  // delivery still calls this function with inspectionOnly=false, but a
  // generation transition must never finish old subscriber work under newly
  // uploaded code.
  if (inspectionOnly) {
    const terminalBlock = db
      .select({
        accountIndex: actorBlockDrizzleSchemas.actorBlocks.accountIndex,
      })
      .from(actorBlockDrizzleSchemas.actorBlocks)
      .orderBy(desc(actorBlockDrizzleSchemas.actorBlocks.accountIndex))
      .limit(1)
      .get();
    let pendingFrontendSubscriberCount = 0;
    for (const subscriber of subscribers) {
      if (
        subscriber.deliveryAttempts > 0 ||
        subscriber.nextRetryAt !== null ||
        subscriber.lastDeliveryError !== null ||
        (terminalBlock !== undefined &&
          (subscriber.currentAccountIndex === null ||
            subscriber.currentAccountIndex < terminalBlock.accountIndex))
      ) {
        pendingFrontendSubscriberCount += 1;
      }
    }
    if (pendingFrontendSubscriberCount > 0) {
      return yield* new ZerospinError({
        code: 'actor-block-generation-self-hosted-drain-required',
        message:
          'ActorBlockRepo has pending frontend delivery that self-hosted generation control must not finish with newly uploaded code',
        extra: { pendingFrontendSubscriberCount },
      });
    }
    return { pendingFrontendSubscriberCount };
  }

  const priorAlarmAt = yield* Effect.promise(() => storage.getAlarm());
  const failedFrontendRepoNames = new Set<string>();
  let nextAlarmAt: number | null = null;
  let pendingFrontendSubscriberCount = 0;
  let anotherForcedDrainPassRequired = true;
  while (anotherForcedDrainPassRequired) {
    anotherForcedDrainPassRequired = false;
    const currentSubscribers = db
      .select()
      .from(actorBlockDrizzleSchemas.frontendSubscribers)
      .all();
    for (const subscriber of currentSubscribers) {
      if (failedFrontendRepoNames.has(subscriber.frontendRepoName)) {
        continue;
      }

      // A future retry remains durable work. Keep its exact deadline even
      // though this drain must not call FrontendRepo before that deadline.
      if (
        !forceRetryNow &&
        subscriber.nextRetryAt !== null &&
        subscriber.nextRetryAt > now
      ) {
        pendingFrontendSubscriberCount += 1;
        if (nextAlarmAt === null || subscriber.nextRetryAt < nextAlarmAt) {
          nextAlarmAt = subscriber.nextRetryAt;
        }
        continue;
      }

      const blockRows =
        subscriber.currentAccountIndex === null
          ? db
              .select()
              .from(actorBlockDrizzleSchemas.actorBlocks)
              .orderBy(asc(actorBlockDrizzleSchemas.actorBlocks.accountIndex))
              .limit(101)
              .all()
          : db
              .select()
              .from(actorBlockDrizzleSchemas.actorBlocks)
              .where(
                gt(
                  actorBlockDrizzleSchemas.actorBlocks.accountIndex,
                  subscriber.currentAccountIndex,
                ),
              )
              .orderBy(asc(actorBlockDrizzleSchemas.actorBlocks.accountIndex))
              .limit(101)
              .all();
      if (blockRows.length === 0) {
        continue;
      }

      const hasMoreBlocks = blockRows.length > 100;
      const batchRows = blockRows.slice(0, 100);
      const blocks: IActorBlock[] = [];
      for (const row of batchRows) {
        blocks.push({
          pushedBlockId: row.pushedBlockId,
          lastAccountCursor: row.lastAccountCursor,
          accountIndex: row.accountIndex,
          executedCommands: yield* Schema.decodeUnknown(
            Schema.parseJson(
              Schema.Array(
                Schema.Union(
                  EncodedExecutedAccountCommandSchema,
                  ExecutedPushedCommandSchema,
                ),
              ),
            ),
          )(row.executedCommands).pipe(
            mapParseError({
              code: 'actor-block-executed-commands-decode-failed',
              prefix: 'Failed to decode actor block executed commands',
            }),
          ),
          failedCommands: yield* Schema.decodeUnknown(
            Schema.parseJson(
              Schema.Array(
                Schema.Union(
                  EncodedFailedAccountCommandSchema,
                  FailedPushedCommandSchema,
                ),
              ),
            ),
          )(row.failedCommands).pipe(
            mapParseError({
              code: 'actor-block-failed-commands-decode-failed',
              prefix: 'Failed to decode actor block failed commands',
            }),
          ),
          appliedMutations: yield* Schema.decodeUnknown(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(row.appliedMutations).pipe(
            mapParseError({
              code: 'actor-block-applied-mutations-decode-failed',
              prefix: 'Failed to decode actor block mutations',
            }),
          ),
          deltas: yield* Schema.decodeUnknown(
            Schema.parseJson(
              Schema.Record({ key: Schema.String, value: ActorDeltaSchema }),
            ),
          )(row.deltas).pipe(
            mapParseError({
              code: 'actor-block-deltas-decode-failed',
              prefix: 'Failed to decode actor block deltas',
            }),
          ),
        });
      }

      const currentAccountCursorMatch =
        subscriber.currentAccountCursor === null
          ? isNull(
              actorBlockDrizzleSchemas.frontendSubscribers.currentAccountCursor,
            )
          : eq(
              actorBlockDrizzleSchemas.frontendSubscribers.currentAccountCursor,
              subscriber.currentAccountCursor,
            );
      const currentAccountIndexMatch =
        subscriber.currentAccountIndex === null
          ? isNull(
              actorBlockDrizzleSchemas.frontendSubscribers.currentAccountIndex,
            )
          : eq(
              actorBlockDrizzleSchemas.frontendSubscribers.currentAccountIndex,
              subscriber.currentAccountIndex,
            );
      const nextRetryAtMatch =
        subscriber.nextRetryAt === null
          ? isNull(actorBlockDrizzleSchemas.frontendSubscribers.nextRetryAt)
          : eq(
              actorBlockDrizzleSchemas.frontendSubscribers.nextRetryAt,
              subscriber.nextRetryAt,
            );
      const lastDeliveryErrorMatch =
        subscriber.lastDeliveryError === null
          ? isNull(
              actorBlockDrizzleSchemas.frontendSubscribers.lastDeliveryError,
            )
          : eq(
              actorBlockDrizzleSchemas.frontendSubscribers.lastDeliveryError,
              subscriber.lastDeliveryError,
            );
      const subscriberSnapshotMatch = and(
        eq(
          actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
          subscriber.frontendRepoName,
        ),
        eq(
          actorBlockDrizzleSchemas.frontendSubscribers.frontendName,
          subscriber.frontendName,
        ),
        currentAccountCursorMatch,
        currentAccountIndexMatch,
        eq(
          actorBlockDrizzleSchemas.frontendSubscribers.deliveryAttempts,
          subscriber.deliveryAttempts,
        ),
        nextRetryAtMatch,
        lastDeliveryErrorMatch,
      );

      const frontendRepo = env.FRONTEND_REPO.getByName(
        subscriber.frontendRepoName,
      );
      let failedRetryAt: number | null = null;
      let subscriberSnapshotStillCurrent = true;
      const delivered = yield* makeAsync<
        Schema.EitherEncoded<void, IAnyErrorJson>
      >(() => frontendRepo.handleActorBlocks(blocks)).pipe(
        Effect.flatMap(decodeRpc),
        Effect.as(true),
        Effect.catchAll(error =>
          Effect.sync(() => {
            const deliveryAttempts = subscriber.deliveryAttempts + 1;
            // Persist the same deadline that the final alarm scheduling step
            // observes so an early alarm cannot delete the pending retry.
            failedRetryAt =
              Date.now() + Math.min(10_000, 250 * 2 ** deliveryAttempts);
            const updatedSubscriber = db
              .update(actorBlockDrizzleSchemas.frontendSubscribers)
              .set({
                deliveryAttempts,
                nextRetryAt: failedRetryAt,
                lastDeliveryError: error.message,
              })
              .where(subscriberSnapshotMatch)
              .returning({
                frontendRepoName:
                  actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
              })
              .get();
            subscriberSnapshotStillCurrent = updatedSubscriber !== undefined;
            return false;
          }),
        ),
      );
      if (!delivered) {
        if (!subscriberSnapshotStillCurrent) {
          continue;
        }
        failedFrontendRepoNames.add(subscriber.frontendRepoName);
        pendingFrontendSubscriberCount += 1;
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
      const updatedSubscriber = db
        .update(actorBlockDrizzleSchemas.frontendSubscribers)
        .set({
          currentAccountCursor: lastBlock.lastAccountCursor,
          currentAccountIndex: lastBlock.accountIndex,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
        })
        .where(subscriberSnapshotMatch)
        .returning({
          frontendRepoName:
            actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
        })
        .get();
      if (updatedSubscriber === undefined) {
        continue;
      }
      if (hasMoreBlocks) {
        if (forceRetryNow) {
          anotherForcedDrainPassRequired = true;
        } else {
          pendingFrontendSubscriberCount += 1;
          if (nextAlarmAt === null || now < nextAlarmAt) {
            nextAlarmAt = now;
          }
        }
      }
    }
  }

  yield* Effect.promise(() =>
    storage.transaction(async transaction => {
      const currentAlarmAt = await transaction.getAlarm();
      if (nextAlarmAt !== null) {
        if (
          currentAlarmAt === null ||
          currentAlarmAt <= Date.now() ||
          nextAlarmAt < currentAlarmAt
        ) {
          await transaction.setAlarm(nextAlarmAt);
        }
      } else if (priorAlarmAt !== null && currentAlarmAt === priorAlarmAt) {
        await transaction.deleteAlarm();
      }
    }),
  );

  return { pendingFrontendSubscriberCount };
});
