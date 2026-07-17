import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/** Finishes hosted service publication or only inspects it during local reload. */
export const drainGeneration = Effect.fn('ServiceRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    local: boolean;
    generationId: string;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingServiceBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, local, generationId, serviceName, storage } = props;

    // 1 — hosted activation finishes publication into the immutable service ledger.
    if (!local) {
      yield* drainServiceBlockOutbox({
        db,
        storage,
        generationId,
        serviceName,
      });
    }

    // 2 — local Wrangler reload performs only this read-only inspection.
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
        code: local
          ? 'service-generation-local-drain-required'
          : 'service-generation-drain-incomplete',
        message: local
          ? 'ServiceRepo has pending work that local hot reload must not finish with new code'
          : 'ServiceRepo still has pending work after hosted generation drain',
        extra: { pendingServiceBlockCount },
      });
    }

    return { pendingServiceBlockCount };
  },
);
