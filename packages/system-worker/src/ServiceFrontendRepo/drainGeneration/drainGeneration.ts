import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { drainServiceFrontendBlockOutbox } from '../drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

export const drainGeneration = Effect.fn('ServiceFrontendRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    key: {
      generationId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingServiceFrontendBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, deliveryQueue, key, storage } = props;
    yield* drainServiceFrontendBlockOutbox({
      db,
      deliveryQueue,
      key,
      storage,
    });

    const pendingServiceFrontendBlockCount = db
      .select({
        frontendIndex:
          serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
            .frontendIndex,
      })
      .from(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
      .where(
        or(
          isNull(
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
              .publishedAt,
          ),
          isNotNull(
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
              .failure,
          ),
        ),
      )
      .all().length;
    if (pendingServiceFrontendBlockCount > 0) {
      return yield* new ZerospinError({
        code: 'service-frontend-generation-drain-incomplete',
        message:
          'ServiceFrontendRepo still has pending archive work after generation drain',
        extra: { pendingServiceFrontendBlockCount },
      });
    }
    return { pendingServiceFrontendBlockCount };
  },
);
