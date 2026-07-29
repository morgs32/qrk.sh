import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/** Finishes hosted service publication or only inspects it for self-hosted control. */
export const drainGeneration = Effect.fn('ServiceRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    inspectionOnly: boolean;
    generationId: string;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingServiceBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, inspectionOnly, generationId, serviceName, storage } = props;

    // 1 — a hosted Worker is pinned to the old generation and may finish
    // publication accepted by that same code. Self-hosted control cannot.
    if (!inspectionOnly) {
      yield* drainServiceBlockOutbox({
        db,
        storage,
        generationId,
        serviceName,
      });
    }

    // 2 — self-hosted control performs only this read-only inspection.
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
        code: inspectionOnly
          ? 'service-generation-self-hosted-drain-required'
          : 'service-generation-drain-incomplete',
        message: inspectionOnly
          ? 'ServiceRepo has pending work that self-hosted control must not finish with newly uploaded code'
          : 'ServiceRepo still has pending work after hosted generation drain',
        extra: { pendingServiceBlockCount },
      });
    }

    return { pendingServiceBlockCount };
  },
);
