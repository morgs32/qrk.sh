import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { actorBlockDrizzleSchemas } from '../ActorBlockRepo.js';

export const subscribeFrontend = Effect.fn('ActorBlockRepo.subscribeFrontend')(
  function* (props: {
    frontendRepoName: string;
    frontendName: string;
    currentAccountCursor: IAccountCursor | null;
    currentAccountIndex: number | null;
    db: IDb;
  }) {
    const { db, ...subscriber } = props;
    const persistedFrontendRepoName = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.frontendRepo),
    )(subscriber.frontendRepoName).pipe(
      mapParseError({
        code: 'actor-block-frontend-repo-name-decode-failed',
        prefix: 'Failed to decode ActorBlockRepo frontendRepoName',
      }),
    );
    db.insert(actorBlockDrizzleSchemas.frontendSubscribers)
      .values({
        ...subscriber,
        frontendRepoName: persistedFrontendRepoName,
        deliveryAttempts: 0,
        nextRetryAt: null,
        lastDeliveryError: null,
      })
      .onConflictDoUpdate({
        target:
          actorBlockDrizzleSchemas.frontendSubscribers.frontendRepoName,
        set: {
          frontendName: sql`excluded.frontendName`,
          currentAccountCursor: sql`excluded.currentAccountCursor`,
          currentAccountIndex: sql`excluded.currentAccountIndex`,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
        },
      })
      .run();
  },
);
