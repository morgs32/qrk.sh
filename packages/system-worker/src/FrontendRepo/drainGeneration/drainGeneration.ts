import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { drainFrontendBlockOutbox } from '../drainFrontendBlockOutbox/drainFrontendBlockOutbox.js';
import { drainPushedBlockOutbox } from '../drainPushedBlockOutbox/drainPushedBlockOutbox.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

/** Finishes hosted frontend outboxes or only inspects them for self-hosted control. */
export const drainGeneration = Effect.fn('FrontendRepo.drainGeneration')(
  function* (props: {
    configuredSystemId: string;
    db: IDb;
    inspectionOnly: boolean;
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
    const { db, inspectionOnly, key, storage } = props;

    // 1 — a hosted Worker is pinned to the old generation and may finish work
    // accepted by that same code. Self-hosted control has only the newly
    // uploaded code, so its drain is inspection-only.
    if (!inspectionOnly) {
      yield* drainPushedBlockOutbox({ db, key });
      yield* drainFrontendBlockOutbox({
        configuredSystemId: props.configuredSystemId,
        db,
        key,
        storage,
      });
    }

    // 2 — self-hosted control only reaches these reads; it never executes old
    // work with newly uploaded code.
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
        code: inspectionOnly
          ? 'frontend-generation-self-hosted-drain-required'
          : 'frontend-generation-drain-incomplete',
        message: inspectionOnly
          ? 'FrontendRepo has pending work that self-hosted control must not finish with newly uploaded code'
          : 'FrontendRepo still has pending work after hosted generation drain',
        extra: { pendingPushedBlockCount, pendingFrontendBlockCount },
      });
    }

    return { pendingPushedBlockCount, pendingFrontendBlockCount };
  },
);
