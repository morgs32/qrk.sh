import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { isNull } from 'drizzle-orm';
import { Effect } from 'effect';

import {
  getLastAccountCursor,
  getLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const getProjectionReadiness = Effect.fn(
  'FrontendRepo.getProjectionReadiness',
)(function* (props: {
  db: IDb;
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
    generationId: string;
    systemWorkerName: string;
    lastAccountCursor: string | null;
    accountIndex: number | null;
    frontendIndex: number;
  }>,
  IAnyError,
  Async
> {
  const { db, key, storage } = props;
  const systemWorkerName = yield* Effect.sync(() =>
    storage.kv.get('systemWorkerName'),
  );
  if (typeof systemWorkerName !== 'string' || systemWorkerName.length === 0) {
    return yield* new ZerospinError({
      code: 'frontend-projection-system-worker-name-required',
      message:
        'FrontendRepo has no persisted system worker identity for this projection',
    });
  }
  const frontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
  if (
    typeof frontendIndex !== 'number' ||
    !Number.isInteger(frontendIndex) ||
    frontendIndex < 0
  ) {
    return yield* new ZerospinError({
      code: 'frontend-projection-state-required',
      message: 'FrontendRepo is not initialized for this exact frontend target',
    });
  }

  const pendingArchiveRow = db
    .select({
      frontendIndex:
        frontendRepoDrizzleSchemas.frontendBlockOutbox.frontendIndex,
    })
    .from(frontendRepoDrizzleSchemas.frontendBlockOutbox)
    .where(isNull(frontendRepoDrizzleSchemas.frontendBlockOutbox.publishedAt))
    .get();
  if (pendingArchiveRow !== undefined) {
    return yield* new ZerospinError({
      code: 'frontend-projection-archive-pending',
      message: `FrontendRepo archive is pending at index ${pendingArchiveRow.frontendIndex}`,
    });
  }

  const lastAccountCursor = yield* getLastAccountCursor({
    storage,
    defaultValue: null,
  });
  const accountIndex = yield* getLastAccountIndex({
    storage,
    defaultValue: null,
  });
  if ((lastAccountCursor === null) !== (accountIndex === null)) {
    return yield* new ZerospinError({
      code: 'frontend-projection-account-watermark-incomplete',
      message:
        'FrontendRepo account cursor and index must both be null or both be present',
    });
  }

  return {
    generationId: key.generationId,
    systemWorkerName,
    lastAccountCursor,
    accountIndex,
    frontendIndex,
  };
});
