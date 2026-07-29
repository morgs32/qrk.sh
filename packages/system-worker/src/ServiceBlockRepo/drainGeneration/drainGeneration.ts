import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, gt, isNotNull, lt, ne, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainAccountSubscribers } from '../drainAccountSubscribers/drainAccountSubscribers.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/** Finishes hosted service fanout or only inspects it for self-hosted control. */
export const drainGeneration = Effect.fn('ServiceBlockRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    generationId: string;
    inspectionOnly: boolean;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      pendingAccountSubscriberCount: number;
      pendingServiceFrontendSubscriberCount: number;
    }>,
    IAnyError,
    Async
  > {
    const { db, generationId, inspectionOnly, serviceName, storage } = props;

    // 1 — a hosted Worker is pinned to the old generation and may finish its
    // account and service-frontend delivery. Self-hosted control has only the
    // newly uploaded code, so it performs only the inspection below.
    if (!inspectionOnly) {
      const drainSequence = yield* Effect.promise(() =>
        storage.transaction(async transaction => {
          const previousDrainSequence =
            (await transaction.get<number>(
              'serviceBlockSubscriberDrainSequence',
            )) ?? 0;
          const nextDrainSequence = previousDrainSequence + 1;
          await transaction.put(
            'serviceBlockSubscriberDrainSequence',
            nextDrainSequence,
          );
          return nextDrainSequence;
        }),
      );
      const accountNextRetryAt = yield* drainAccountSubscribers({
        db,
        serviceName,
      });
      const serviceFrontendNextRetryAt = yield* drainServiceFrontendSubscribers(
        {
          db,
          key: { generationId, serviceName },
          onlyServiceFrontendRepoName: null,
          failFast: false,
        },
      );
      const nextRetryAt =
        accountNextRetryAt === null
          ? serviceFrontendNextRetryAt
          : serviceFrontendNextRetryAt === null
            ? accountNextRetryAt
            : Math.min(accountNextRetryAt, serviceFrontendNextRetryAt);
      yield* Effect.promise(() =>
        storage.transaction(async transaction => {
          const currentDrainSequence = await transaction.get<number>(
            'serviceBlockSubscriberDrainSequence',
          );
          const currentAlarm = await transaction.getAlarm();
          if (nextRetryAt === null) {
            if (currentDrainSequence === drainSequence) {
              await transaction.deleteAlarm();
            }
            return;
          }
          if (
            currentAlarm === null ||
            currentAlarm <= Date.now() ||
            nextRetryAt < currentAlarm
          ) {
            await transaction.setAlarm(nextRetryAt);
          }
        }),
      );
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

    // 3 — account replay cannot start until service effects exist in every account ledger.
    if (
      pendingAccountSubscriberCount > 0 ||
      pendingServiceFrontendSubscriberCount > 0
    ) {
      return yield* new ZerospinError({
        code: inspectionOnly
          ? 'service-block-generation-self-hosted-drain-required'
          : 'service-block-generation-drain-incomplete',
        message: inspectionOnly
          ? 'ServiceBlockRepo has pending subscriber work that self-hosted control must not finish with newly uploaded code'
          : 'ServiceBlockRepo still has pending subscriber work after hosted generation drain',
        extra: {
          pendingAccountSubscriberCount,
          pendingServiceFrontendSubscriberCount,
        },
      });
    }

    return {
      pendingAccountSubscriberCount,
      pendingServiceFrontendSubscriberCount,
    };
  },
);
