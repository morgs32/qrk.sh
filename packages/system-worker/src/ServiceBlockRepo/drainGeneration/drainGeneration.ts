import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, gt, isNotNull, lt, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainAccountSubscribers } from '../drainAccountSubscribers/drainAccountSubscribers.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/** Finishes hosted service fanout or only inspects subscriber work locally. */
export const drainGeneration = Effect.fn('ServiceBlockRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    local: boolean;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingAccountSubscriberCount: number }>,
    IAnyError,
    Async
  > {
    const { db, local, serviceName, storage } = props;

    // 1 — hosted activation may deliver every archived service block to its accounts.
    if (!local) {
      yield* drainAccountSubscribers({ db, storage, serviceName });
    }

    // 2 — compare every subscriber against the immutable terminal service block.
    const terminalBlock = db
      .select({
        serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
      })
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .limit(1)
      .get();
    const pendingAccountSubscriberCount =
      terminalBlock === undefined
        ? db
            .select({
              accountRepoName:
                serviceBlockDrizzleSchemas.accountSubscribers.accountRepoName,
            })
            .from(serviceBlockDrizzleSchemas.accountSubscribers)
            .where(
              or(
                gt(
                  serviceBlockDrizzleSchemas.accountSubscribers
                    .deliveryAttempts,
                  0,
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.accountSubscribers.nextRetryAt,
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.accountSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length
        : db
            .select({
              accountRepoName:
                serviceBlockDrizzleSchemas.accountSubscribers.accountRepoName,
            })
            .from(serviceBlockDrizzleSchemas.accountSubscribers)
            .where(
              or(
                lt(
                  serviceBlockDrizzleSchemas.accountSubscribers
                    .currentServiceIndex,
                  terminalBlock.serviceIndex,
                ),
                gt(
                  serviceBlockDrizzleSchemas.accountSubscribers
                    .deliveryAttempts,
                  0,
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.accountSubscribers.nextRetryAt,
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.accountSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length;

    // 3 — account replay cannot start until service effects exist in every account ledger.
    if (pendingAccountSubscriberCount > 0) {
      return yield* new ZerospinError({
        code: local
          ? 'service-block-generation-local-drain-required'
          : 'service-block-generation-drain-incomplete',
        message: local
          ? 'ServiceBlockRepo has pending subscriber work that local hot reload must not finish with new code'
          : 'ServiceBlockRepo still has pending subscriber work after hosted generation drain',
        extra: { pendingAccountSubscriberCount },
      });
    }

    return { pendingAccountSubscriberCount };
  },
);
