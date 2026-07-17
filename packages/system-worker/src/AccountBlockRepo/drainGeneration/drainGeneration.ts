import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

/** Finishes hosted actor fanout or only inspects subscriber work locally. */
export const drainGeneration = Effect.fn('AccountBlockRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    hostedDrain: Effect.Effect<void, IAnyError, Async>;
    local: boolean;
  }): Effect.fn.Return<
    Readonly<{ pendingActorSubscriberCount: number }>,
    IAnyError,
    Async
  > {
    const { db, hostedDrain, local } = props;

    // 1 — hosted activation may finish immutable account-block delivery.
    if (!local) {
      yield* hostedDrain;
    }

    // 2 — local Wrangler reload skips the drain and reaches only this inspection.
    const terminalBlock = db
      .select({
        accountIndex: accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
      })
      .from(accountBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(
        desc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
      )
      .limit(1)
      .get();
    const pendingActorSubscriberCount =
      terminalBlock === undefined
        ? db
            .select({
              actorRepoName:
                accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
            })
            .from(accountBlockDrizzleSchemas.actorSubscribers)
            .where(
              or(
                gt(
                  accountBlockDrizzleSchemas.actorSubscribers.deliveryAttempts,
                  0,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.nextRetryAt,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.lastDeliveryError,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.failedAt,
                ),
              ),
            )
            .all().length
        : db
            .select({
              actorRepoName:
                accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
            })
            .from(accountBlockDrizzleSchemas.actorSubscribers)
            .where(
              or(
                isNull(
                  accountBlockDrizzleSchemas.actorSubscribers
                    .currentAccountIndex,
                ),
                lt(
                  accountBlockDrizzleSchemas.actorSubscribers
                    .currentAccountIndex,
                  terminalBlock.accountIndex,
                ),
                gt(
                  accountBlockDrizzleSchemas.actorSubscribers.deliveryAttempts,
                  0,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.nextRetryAt,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.lastDeliveryError,
                ),
                isNotNull(
                  accountBlockDrizzleSchemas.actorSubscribers.failedAt,
                ),
              ),
            )
            .all().length;

    // 3 — both modes fail closed until actor delivery has no durable work.
    if (pendingActorSubscriberCount > 0) {
      return yield* new ZerospinError({
        code: local
          ? 'account-block-generation-local-drain-required'
          : 'account-block-generation-drain-incomplete',
        message: local
          ? 'AccountBlockRepo has pending subscriber work that local hot reload must not finish with new code'
          : 'AccountBlockRepo still has pending subscriber work after hosted generation drain',
        extra: { pendingActorSubscriberCount },
      });
    }

    return { pendingActorSubscriberCount };
  },
);
