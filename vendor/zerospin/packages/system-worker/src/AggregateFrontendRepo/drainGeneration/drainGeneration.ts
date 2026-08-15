import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';
import { drainAggregateFrontendBlockOutbox } from '../drainAggregateFrontendBlockOutbox/drainAggregateFrontendBlockOutbox.js';
import { drainPushBlockOutbox } from '../drainPushBlockOutbox/drainPushBlockOutbox.js';

/** Finishes frontend outboxes and verifies that no obligation remains. */
export const drainGeneration = Effect.fn(
  'AggregateFrontendRepo.drainGeneration',
)(function* (props: {
  configuredSystemId: string;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  Readonly<{
    pendingPushBlockCount: number;
    pendingFrontendBlockCount: number;
  }>,
  IAnyError,
  Async
> {
  const { db, deliveryQueue, key, storage } = props;

  // 1 — the compatible Worker settles predecessor commands and archives.
  yield* drainPushBlockOutbox({
    db,
    deliveryQueue,
    key,
  });
  yield* drainAggregateFrontendBlockOutbox({
    configuredSystemId: props.configuredSystemId,
    db,
    deliveryQueue,
    key,
    storage,
  });

  // 2 — verify every predecessor frontend obligation is terminal.
  const pendingPushBlockCount = db
    .select({
      writeIndex:
        aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.writeIndex,
    })
    .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
    .where(
      or(
        isNull(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.finalizedAt),
        isNotNull(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox.failure),
      ),
    )
    .all().length;
  const pendingFrontendBlockCount = db
    .select({
      frontendIndex:
        aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
          .frontendIndex,
    })
    .from(aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox)
    .where(
      or(
        isNull(
          aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
            .publishedAt,
        ),
        isNotNull(
          aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
            .failure,
        ),
      ),
    )
    .all().length;

  // 3 — fail closed until every required frontend outbox is terminal.
  if (pendingPushBlockCount > 0 || pendingFrontendBlockCount > 0) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-generation-drain-incomplete',
      message:
        'AggregateFrontendRepo still has pending work after generation drain',
      extra: { pendingPushBlockCount, pendingFrontendBlockCount },
    });
  }

  return { pendingPushBlockCount, pendingFrontendBlockCount };
});
