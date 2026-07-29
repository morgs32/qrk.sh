import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { drainAccountOutboxes } from '../drainAccountOutboxes/drainAccountOutboxes.js';

/** Finishes hosted account outboxes or only inspects them for self-hosted control. */
export const drainGeneration = Effect.fn('AccountRepo.drainGeneration')(
  function* (props: {
    accountId: string;
    accountName: string;
    accountRepoName: string;
    db: IDb;
    inspectionOnly: boolean;
    generationId: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      pendingServiceSubscriptionCount: number;
      pendingAccountBlockCount: number;
    }>,
    IAnyError,
    Async
  > {
    const {
      accountId,
      accountName,
      accountRepoName,
      db,
      inspectionOnly,
      generationId,
      storage,
    } = props;

    // 1 — a hosted Worker is pinned to the old generation and may finish work
    // accepted by that same code. Self-hosted control cannot.
    if (!inspectionOnly) {
      yield* drainAccountOutboxes({
        accountRepoName,
        generationId,
        accountId,
        accountName,
        db,
        storage,
      });
    }

    // 2 — self-hosted control performs only these read-only inspections.
    const pendingServiceSubscriptionCount = db
      .select({
        serviceRepoName:
          accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
      })
      .from(accountRepoDrizzleSchemas.serviceSubscriptions)
      .where(
        or(
          isNull(accountRepoDrizzleSchemas.serviceSubscriptions.subscribedAt),
          isNotNull(accountRepoDrizzleSchemas.serviceSubscriptions.failure),
        ),
      )
      .all().length;
    const pendingAccountBlockCount = db
      .select({
        accountIndex: accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
      })
      .from(accountRepoDrizzleSchemas.accountBlockOutbox)
      .where(
        or(
          isNull(accountRepoDrizzleSchemas.accountBlockOutbox.publishedAt),
          isNotNull(accountRepoDrizzleSchemas.accountBlockOutbox.failure),
        ),
      )
      .all().length;

    // 3 — source replay is unsafe while either durable account obligation remains.
    if (pendingServiceSubscriptionCount > 0 || pendingAccountBlockCount > 0) {
      return yield* new ZerospinError({
        code: inspectionOnly
          ? 'account-generation-self-hosted-drain-required'
          : 'account-generation-drain-incomplete',
        message: inspectionOnly
          ? 'AccountRepo has pending work that self-hosted control must not finish with newly uploaded code'
          : 'AccountRepo still has pending work after hosted generation drain',
        extra: { pendingServiceSubscriptionCount, pendingAccountBlockCount },
      });
    }

    return { pendingServiceSubscriptionCount, pendingAccountBlockCount };
  },
);
