import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { mapParseError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

export const subscribeAggregate = Effect.fn(
  'ServiceBlockRepo.subscribeAggregate',
)(function* (props: {
  aggregateRepoName: string;
  aggregateId: string;
  aggregateName: string;
  currentServiceCursor: IServiceCursorId;
  currentServiceIndex: number;
  db: IDb;
}) {
  const { db, ...subscriber } = props;
  const persistedAggregateRepoName = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(systemWorkerAbbreviations.aggregateRepo),
  )(subscriber.aggregateRepoName).pipe(
    mapParseError({
      code: 'service-block-aggregate-repo-name-decode-failed',
      prefix: 'Failed to decode ServiceBlockRepo aggregateRepoName',
    }),
  );
  db.insert(serviceBlockDrizzleSchemas.aggregateSubscribers)
    .values({
      ...subscriber,
      aggregateRepoName: persistedAggregateRepoName,
      lastDeliveryError: null,
    })
    .onConflictDoUpdate({
      target: serviceBlockDrizzleSchemas.aggregateSubscribers.aggregateRepoName,
      set: {
        aggregateId: sql`excluded.aggregateId`,
        aggregateName: sql`excluded.aggregateName`,
        currentServiceCursor: sql`excluded.currentServiceCursor`,
        currentServiceIndex: sql`excluded.currentServiceIndex`,
        lastDeliveryError: null,
      },
    })
    .run();
});
