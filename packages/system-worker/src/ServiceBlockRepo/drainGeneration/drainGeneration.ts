import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainAggregateSubscribers } from '../drainAggregateSubscribers/drainAggregateSubscribers.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/** Finishes service fanout and verifies that no subscriber remains behind. */
export const drainGeneration = Effect.fn('ServiceBlockRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationId: string;
    serviceName: string;
  }): Effect.fn.Return<
    Readonly<{
      pendingAggregateSubscriberCount: number;
      pendingServiceFrontendSubscriberCount: number;
    }>,
    IAnyError,
    Async
  > {
    const { db, deliveryQueue, generationId, serviceName } = props;

    // 1 — the compatible Worker finishes predecessor subscriber delivery.
    yield* drainAggregateSubscribers({
      db,
      deliveryQueue,
      serviceName,
    });
    yield* drainServiceFrontendSubscribers({
      db,
      deliveryQueue,
      key: { generationId, serviceName },
      onlyServiceFrontendRepoName: null,
    });

    // 2 — compare every subscriber against the immutable terminal service block.
    const terminalBlock = db
      .select({
        serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
      })
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .limit(1)
      .get();
    const pendingAggregateSubscriberCount =
      terminalBlock === undefined
        ? db
            .select({
              aggregateRepoName:
                serviceBlockDrizzleSchemas.aggregateSubscribers
                  .aggregateRepoName,
            })
            .from(serviceBlockDrizzleSchemas.aggregateSubscribers)
            .where(
              isNotNull(
                serviceBlockDrizzleSchemas.aggregateSubscribers
                  .lastDeliveryError,
              ),
            )
            .all().length
        : db
            .select({
              aggregateRepoName:
                serviceBlockDrizzleSchemas.aggregateSubscribers
                  .aggregateRepoName,
            })
            .from(serviceBlockDrizzleSchemas.aggregateSubscribers)
            .where(
              or(
                lt(
                  serviceBlockDrizzleSchemas.aggregateSubscribers
                    .currentServiceIndex,
                  terminalBlock.serviceIndex,
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.aggregateSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length;
    const pendingServiceFrontendSubscriberCount =
      terminalBlock === undefined
        ? db
            .select({
              serviceFrontendRepoName:
                serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                  .serviceFrontendRepoName,
            })
            .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .where(
              or(
                ne(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers.status,
                  'live',
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length
        : db
            .select({
              serviceFrontendRepoName:
                serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                  .serviceFrontendRepoName,
            })
            .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .where(
              or(
                isNull(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                    .currentServiceIndex,
                ),
                lt(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                    .currentServiceIndex,
                  terminalBlock.serviceIndex,
                ),
                ne(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers.status,
                  'live',
                ),
                isNotNull(
                  serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                    .lastDeliveryError,
                ),
              ),
            )
            .all().length;

    // 3 — aggregate replay cannot start until service effects exist in every aggregate ledger.
    if (
      pendingAggregateSubscriberCount > 0 ||
      pendingServiceFrontendSubscriberCount > 0
    ) {
      return yield* new ZerospinError({
        code: 'service-block-generation-drain-incomplete',
        message:
          'ServiceBlockRepo still has pending subscriber work after generation drain',
        extra: {
          pendingAggregateSubscriberCount,
          pendingServiceFrontendSubscriberCount,
        },
      });
    }

    return {
      pendingAggregateSubscriberCount,
      pendingServiceFrontendSubscriberCount,
    };
  },
);
