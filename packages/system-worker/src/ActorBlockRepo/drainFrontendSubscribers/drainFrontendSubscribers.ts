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
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, gt } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlock } from '../../types.js';
import { actorBlockDrizzleSchemas } from '../ActorBlockRepo.js';

export const drainFrontendSubscribers = Effect.fn(
  'ActorBlockRepo.drainFrontendSubscribers',
)(function* (props: {
  db: IDb;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, storage } = props;
  const now = Date.now();
  const subscribers = db
    .select()
    .from(actorBlockDrizzleSchemas.frontendSubscribers)
    .all();

  let nextAlarmAt: number | null = null;
  for (const subscriber of subscribers) {
    // A future retry remains durable work. Keep its exact deadline even though
    // this drain must not call the FrontendRepo before that deadline is due.
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
    const blockRows =
      subscriber.currentAccountIndex === null
        ? db
            .select()
            .from(actorBlockDrizzleSchemas.actorBlocks)
            .orderBy(asc(actorBlockDrizzleSchemas.actorBlocks.accountIndex))
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
            .all();
    if (blockRows.length === 0) {
      continue;
    }
    const blocks: IActorBlock[] = [];
    for (const row of blockRows) {
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
    const frontendRepo = env.FRONTEND_REPO.getByName(
      subscriber.frontendRepoName,
    );
    let failedRetryAt: number | null = null;
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
          db.update(actorBlockDrizzleSchemas.frontendSubscribers)
            .set({
              deliveryAttempts,
              nextRetryAt: failedRetryAt,
              lastDeliveryError: error.message,
            })
            .where(
              eq(
                actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
                subscriber.frontendRepoName,
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
    db.update(actorBlockDrizzleSchemas.frontendSubscribers)
      .set({
        currentAccountCursor: lastBlock.lastAccountCursor,
        currentAccountIndex: lastBlock.accountIndex,
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
      })
      .where(
        eq(
          actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
          subscriber.frontendRepoName,
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
