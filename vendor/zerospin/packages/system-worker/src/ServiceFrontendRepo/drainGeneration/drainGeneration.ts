import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainServiceFrontendBlockOutbox } from '../drainServiceFrontendBlockOutbox/drainServiceFrontendBlockOutbox.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

export const drainGeneration = Effect.fn('ServiceFrontendRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    key: {
      generationId: string;
      serviceName: string;
      actorName: string;
      actorId: string;
      frontendName: string;
    };
    inspectionOnly: boolean;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{ pendingServiceFrontendBlockCount: number }>,
    IAnyError,
    Async
  > {
    const { db, inspectionOnly, key, storage } = props;
    if (!inspectionOnly) {
      yield* drainServiceFrontendBlockOutbox({ db, key, storage });
    }

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
        code: inspectionOnly
          ? 'service-frontend-generation-self-hosted-drain-required'
          : 'service-frontend-generation-drain-incomplete',
        message: inspectionOnly
          ? 'ServiceFrontendRepo has pending archive work that self-hosted generation control must not finish with newly uploaded code'
          : 'ServiceFrontendRepo still has pending archive work after hosted generation drain',
        extra: { pendingServiceFrontendBlockCount },
      });
    }
    return { pendingServiceFrontendBlockCount };
  },
);
