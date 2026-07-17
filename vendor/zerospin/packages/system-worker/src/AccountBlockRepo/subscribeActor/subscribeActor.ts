/*
 * System-worker annotation:
 * Registers an ActorRepo as a durable account-block subscriber.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

export const subscribeActor = Effect.fn('AccountBlockRepo.subscribeActor')(
  function* (props: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    currentAccountCursor: IAccountCursor | null;
    currentAccountIndex: number | null;
    db: IDb;
    actorRepoName: string;
  }) {
    const {
      accountId,
      accountName,
      actorId,
      actorName,
      currentAccountCursor,
      currentAccountIndex,
      db,
      actorRepoName,
    } = props;
    const persistedActorRepoName = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.actorRepo),
    )(actorRepoName).pipe(
      mapParseError({
        code: 'account-block-actor-repo-name-decode-failed',
        prefix: 'Failed to decode AccountBlockRepo actorRepoName',
      }),
    );
    db.insert(accountBlockDrizzleSchemas.actorSubscribers)
      .values({
        actorRepoName: persistedActorRepoName,
        accountId,
        accountName,
        actorId,
        actorName,
        currentAccountCursor,
        currentAccountIndex,
        queuedAccountCursor: currentAccountCursor,
        queuedAccountIndex: currentAccountIndex,
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
        failedAt: null,
        succeededAt: null,
      })
      .onConflictDoUpdate({
        target: accountBlockDrizzleSchemas.actorSubscribers.actorRepoName,
        set: {
          accountId: sql`excluded.accountId`,
          accountName: sql`excluded.accountName`,
          actorId: sql`excluded.actorId`,
          actorName: sql`excluded.actorName`,
          currentAccountCursor: sql`excluded.currentAccountCursor`,
          currentAccountIndex: sql`excluded.currentAccountIndex`,
          queuedAccountCursor: sql`excluded.queuedAccountCursor`,
          queuedAccountIndex: sql`excluded.queuedAccountIndex`,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
          failedAt: null,
        },
      })
      .run();
  },
);
