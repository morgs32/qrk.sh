/*
 * System-worker annotation:
 * Rebuilds AccountBlockRepo subscriber delivery work from durable block state.
 */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, asc, desc, gt, isNull, lt, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAccountBlock } from '../../types.js';
import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

export const refreshQueue = Effect.fn('AccountBlockRepo.refreshQueue')(
  function* (props: { db: IDb; deliveryBatchSize: number }) {
    const { db, deliveryBatchSize } = props;
    const now = Date.now();
    const latestBlock = db
      .select({
        accountIndex: accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
      })
      .from(accountBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(desc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex))
      .get();
    if (latestBlock === undefined) {
      return [];
    }

    const subscribers = db
      .select()
      .from(accountBlockDrizzleSchemas.actorSubscribers)
      .where(
        and(
          or(
            isNull(accountBlockDrizzleSchemas.actorSubscribers.nextRetryAt),
            lt(
              accountBlockDrizzleSchemas.actorSubscribers.nextRetryAt,
              now + 1,
            ),
          ),
          or(
            isNull(
              accountBlockDrizzleSchemas.actorSubscribers.currentAccountIndex,
            ),
            lt(
              accountBlockDrizzleSchemas.actorSubscribers.currentAccountIndex,
              latestBlock.accountIndex,
            ),
          ),
        ),
      )
      .orderBy(
        asc(accountBlockDrizzleSchemas.actorSubscribers.currentAccountIndex),
      )
      .all();
    const firstSubscriber = subscribers[0];
    if (firstSubscriber === undefined) {
      return [];
    }

    const rows =
      firstSubscriber.currentAccountIndex === null
        ? db
            .select()
            .from(accountBlockDrizzleSchemas.finalizedBlocks)
            .orderBy(
              asc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
            )
            .limit(deliveryBatchSize)
            .all()
        : db
            .select()
            .from(accountBlockDrizzleSchemas.finalizedBlocks)
            .where(
              gt(
                accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
                firstSubscriber.currentAccountIndex,
              ),
            )
            .orderBy(
              asc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
            )
            .limit(deliveryBatchSize)
            .all();
    if (rows.length === 0) {
      return yield* new ZerospinError({
        code: 'account-block-cursor-gap',
        message: 'AccountBlockRepo lagging subscriber index has no newer block',
      });
    }

    const blocks: IAccountBlock[] = [];
    for (const row of rows) {
      const executedCommands = yield* Schema.decodeUnknown(
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
          code: 'account-block-executed-commands-decode-failed',
          prefix: 'Failed to decode finalized block executed commands',
        }),
      );
      const failedCommands = yield* Schema.decodeUnknown(
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
          code: 'account-block-failed-commands-decode-failed',
          prefix: 'Failed to decode finalized block failed commands',
        }),
      );
      const appliedMutations = yield* Schema.decodeUnknown(
        Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
      )(row.appliedMutations).pipe(
        mapParseError({
          code: 'account-block-applied-mutations-decode-failed',
          prefix: 'Failed to decode finalized block applied mutations',
        }),
      );
      blocks.push({
        pushedBlockId: row.pushedBlockId,
        lastAccountCursor: row.lastAccountCursor,
        accountIndex: row.accountIndex,
        executedCommands,
        failedCommands,
        appliedMutations,
      });
    }

    const subscriberDeliveries: {
      subscriber: (typeof subscribers)[number];
      blocks: readonly IAccountBlock[];
    }[] = [];
    const sharedBlocks = [...blocks];
    for (const subscriber of subscribers) {
      while (
        sharedBlocks[0] !== undefined &&
        subscriber.currentAccountIndex !== null &&
        sharedBlocks[0].accountIndex <= subscriber.currentAccountIndex
      ) {
        sharedBlocks.shift();
      }

      if (sharedBlocks.length === 0) {
        break;
      }

      subscriberDeliveries.push({
        subscriber,
        blocks: sharedBlocks.slice(),
      });
    }

    return subscriberDeliveries;
  },
);
