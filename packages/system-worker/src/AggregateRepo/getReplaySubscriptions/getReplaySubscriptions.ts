import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { asc } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';

/** Reads active source subscriptions in deterministic repo-name order. */
export const getReplaySubscriptions = Effect.fn(
  'AggregateRepo.getReplaySubscriptions',
)(function* (props: { db: IDb }): Effect.fn.Return<
  readonly Readonly<{
    serviceRepoName: string;
    serviceName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }>[],
  IAnyError
> {
  const { db } = props;

  // 1 — source repo identity supplies a stable reconstruction order.
  const rows = db
    .select()
    .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
    .orderBy(
      asc(aggregateRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName),
    )
    .all();
  const subscriptions: Readonly<{
    serviceRepoName: string;
    serviceName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }>[] = [];

  // 2 — drain must have activated every source row before replay can copy it.
  for (const row of rows) {
    if (row.subscribedAt === null || row.failure !== null) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-subscription-not-active',
        message: `AggregateRepo source subscription "${row.serviceRepoName}" is not active`,
        extra: {
          serviceRepoName: row.serviceRepoName,
          subscribedAt: row.subscribedAt,
          failure: row.failure,
        },
      });
    }
    if (!Number.isInteger(row.currentServiceIndex)) {
      return yield* new ZerospinError({
        code: 'aggregate-replay-subscription-index-invalid',
        message: `AggregateRepo source subscription "${row.serviceRepoName}" has a non-integer service index`,
      });
    }

    // 3 — lifecycle fields are validated above; replay copies membership and watermark only.
    subscriptions.push({
      serviceRepoName: row.serviceRepoName,
      serviceName: row.serviceName,
      currentServiceCursor: row.currentServiceCursor,
      currentServiceIndex: row.currentServiceIndex,
    });
  }

  return subscriptions;
});
