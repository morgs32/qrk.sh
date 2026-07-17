import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

export const subscribeAccount = Effect.fn('ServiceBlockRepo.subscribeAccount')(
  function* (props: {
    accountRepoName: string;
    accountId: string;
    accountName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
    db: IDb;
  }) {
    const { db, ...subscriber } = props;
    const persistedAccountRepoName = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.accountRepo),
    )(subscriber.accountRepoName).pipe(
      mapParseError({
        code: 'service-block-account-repo-name-decode-failed',
        prefix: 'Failed to decode ServiceBlockRepo accountRepoName',
      }),
    );
    db.insert(serviceBlockDrizzleSchemas.accountSubscribers)
      .values({
        ...subscriber,
        accountRepoName: persistedAccountRepoName,
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
      })
      .onConflictDoUpdate({
        target: serviceBlockDrizzleSchemas.accountSubscribers.accountRepoName,
        set: {
          accountId: sql`excluded.accountId`,
          accountName: sql`excluded.accountName`,
          currentServiceCursor: sql`excluded.currentServiceCursor`,
          currentServiceIndex: sql`excluded.currentServiceIndex`,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
        },
      })
      .run();
  },
);
