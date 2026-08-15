import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/** Finishes service publication and verifies that no block remains. */
export const drainGeneration = Effect.fn('ServiceRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationId: string;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingServiceBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, deliveryQueue, generationId, serviceName, storage } = props;

    // 1 — the compatible Worker finishes predecessor service publication.
    yield* drainServiceBlockOutbox({
      db,
      deliveryQueue,
      storage,
      generationId,
      serviceName,
    });

    // 2 — verify every predecessor service block is published.
    const pendingServiceBlockCount = db
      .select({
        serviceIndex: serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
      })
      .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
      .where(
        or(
          isNull(serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt),
          isNotNull(serviceRepoDrizzleSchemas.serviceBlockOutbox.failure),
        ),
      )
      .all().length;

    // 3 — a failed or unpublished block cannot be omitted from the source replay bound.
    if (pendingServiceBlockCount > 0) {
      return yield* new ZerospinError({
        code: 'service-generation-drain-incomplete',
        message: 'ServiceRepo still has pending work after generation drain',
        extra: { pendingServiceBlockCount },
      });
    }

    return { pendingServiceBlockCount };
  },
);
