import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainFrontendBlockOutbox } from '../drainFrontendBlockOutbox/drainFrontendBlockOutbox.js';
import { drainPushedBlockOutbox } from '../drainPushedBlockOutbox/drainPushedBlockOutbox.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

/** Finishes hosted frontend outboxes or only inspects them during local reload. */
export const drainGeneration = Effect.fn('FrontendRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    local: boolean;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      pendingPushedBlockCount: number;
      pendingFrontendBlockCount: number;
    }>,
    IAnyError,
    Async
  > {
    const { db, local, key, storage } = props;

    // 1 — hosted activation is allowed to finish work accepted by old code.
    if (!local) {
      yield* drainPushedBlockOutbox({ db, key });
      yield* drainFrontendBlockOutbox({ db, key, storage });
    }

    // 2 — local Wrangler reload only reaches these reads; it never executes old work with new code.
    const pendingPushedBlockCount = db
      .select({ id: frontendRepoDrizzleSchemas.pushedBlockOutbox.id })
      .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
      .where(
        or(
          isNull(frontendRepoDrizzleSchemas.pushedBlockOutbox.finalizedAt),
          isNotNull(frontendRepoDrizzleSchemas.pushedBlockOutbox.failure),
        ),
      )
      .all().length;
    const pendingFrontendBlockCount = db
      .select({
        frontendIndex:
          frontendRepoDrizzleSchemas.frontendBlockOutbox.frontendIndex,
      })
      .from(frontendRepoDrizzleSchemas.frontendBlockOutbox)
      .where(
        or(
          isNull(frontendRepoDrizzleSchemas.frontendBlockOutbox.publishedAt),
          isNotNull(frontendRepoDrizzleSchemas.frontendBlockOutbox.failure),
        ),
      )
      .all().length;

    // 3 — both modes fail closed until every required frontend outbox is terminal.
    if (pendingPushedBlockCount > 0 || pendingFrontendBlockCount > 0) {
      return yield* new ZerospinError({
        code: local
          ? 'frontend-generation-local-drain-required'
          : 'frontend-generation-drain-incomplete',
        message: local
          ? 'FrontendRepo has pending work that local hot reload must not finish with new code'
          : 'FrontendRepo still has pending work after hosted generation drain',
        extra: { pendingPushedBlockCount, pendingFrontendBlockCount },
      });
    }

    return { pendingPushedBlockCount, pendingFrontendBlockCount };
  },
);
