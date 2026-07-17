import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNotNull, isNull, or } from 'drizzle-orm';
import { Effect } from 'effect';

import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { drainAccountOutboxes } from '../drainAccountOutboxes/drainAccountOutboxes.js';

/** Finishes hosted account outboxes or only inspects them during local reload. */
export const drainGeneration = Effect.fn('AccountRepo.drainGeneration')(
  function* (props: {
    accountId: string;
    accountName: string;
    accountRepoName: string;
    db: IDb;
    local: boolean;
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
      local,
      generationId,
      storage,
    } = props;

    // 1 — hosted activation finishes subscription setup and account-block publication.
    if (!local) {
      yield* drainAccountOutboxes({
        accountRepoName,
        generationId,
        accountId,
        accountName,
        db,
        storage,
      });
    }

    // 2 — local Wrangler reload performs only these read-only inspections.
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
        code: local
          ? 'account-generation-local-drain-required'
          : 'account-generation-drain-incomplete',
        message: local
          ? 'AccountRepo has pending work that local hot reload must not finish with new code'
          : 'AccountRepo still has pending work after hosted generation drain',
        extra: { pendingServiceSubscriptionCount, pendingAccountBlockCount },
      });
    }

    return { pendingServiceSubscriptionCount, pendingAccountBlockCount };
  },
);
