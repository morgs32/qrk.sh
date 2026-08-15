import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNull } from 'drizzle-orm';
import { Effect } from 'effect';

import {
  getLastAggregateCursor,
  getLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';

export const getProjectionReadiness = Effect.fn(
  'AggregateFrontendRepo.getProjectionReadiness',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  Readonly<{
    generationId: string;
    lastAggregateCursor: string | null;
    aggregateIndex: number | null;
    frontendIndex: number;
  }>,
  IAnyError,
  Async
> {
  const { db, key, storage } = props;
  if (
    storage.kv.get('initialized') !== true ||
    storage.kv.get('subscribed') !== true ||
    storage.kv.get('emissionMode') !== 'live'
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-projection-state-required',
      message:
        'AggregateFrontendRepo is not ready for this exact frontend target',
    });
  }
  const frontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
  if (
    typeof frontendIndex !== 'number' ||
    !Number.isInteger(frontendIndex) ||
    frontendIndex < 0
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-projection-state-required',
      message:
        'AggregateFrontendRepo is not initialized for this exact frontend target',
    });
  }

  const pendingArchiveRow = db
    .select({
      frontendIndex:
        aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
          .frontendIndex,
    })
    .from(aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox)
    .where(
      isNull(
        aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox
          .publishedAt,
      ),
    )
    .get();
  if (pendingArchiveRow !== undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-projection-archive-pending',
      message: `AggregateFrontendRepo archive is pending at index ${pendingArchiveRow.frontendIndex}`,
    });
  }

  const lastAggregateCursor = yield* getLastAggregateCursor({
    storage,
    defaultValue: null,
  });
  const aggregateIndex = yield* getLastAggregateIndex({
    storage,
    defaultValue: null,
  });
  if ((lastAggregateCursor === null) !== (aggregateIndex === null)) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-projection-aggregate-watermark-incomplete',
      message:
        'AggregateFrontendRepo aggregate cursor and index must both be null or both be present',
    });
  }

  return {
    generationId: key.generationId,
    lastAggregateCursor,
    aggregateIndex,
    frontendIndex,
  };
});
