import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

/* Ticket creation uses this as the strict state-to-archive readiness barrier. */
export const assertArchiveThrough = Effect.fn(
  'AggregateFrontendBlockRepo.assertArchiveThrough',
)(function* (props: {
  frontendIndex: number;
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { db, frontendIndex, key } = props;
  if (!Number.isInteger(frontendIndex) || frontendIndex < 0) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-readiness-index-invalid',
      message: `Frontend archive readiness index must be a non-negative integer, received ${frontendIndex}`,
    });
  }

  const lineage = db
    .select()
    .from(aggregateFrontendBlockDrizzleSchemas.lineage)
    .where(eq(aggregateFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== key.generationId ||
    lineage.aggregateId !== key.aggregateId ||
    lineage.aggregateName !== key.aggregateName ||
    lineage.userId !== key.userId ||
    lineage.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message:
        'AggregateFrontendBlockRepo lineage is not configured for this exact target',
    });
  }

  const firstLocalFrontendIndex =
    (lineage.predecessorTerminalFrontendIndex ?? 0) + 1;
  if (frontendIndex < firstLocalFrontendIndex) {
    return;
  }
  const rows = db
    .select({
      frontendIndex:
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
          .frontendIndex,
    })
    .from(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
    .where(
      and(
        gte(
          aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
            .frontendIndex,
          firstLocalFrontendIndex,
        ),
        lte(
          aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
            .frontendIndex,
          frontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
          .frontendIndex,
      ),
    )
    .all();

  let expectedFrontendIndex = firstLocalFrontendIndex;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-state-required',
        message: `Frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    expectedFrontendIndex += 1;
  }
  if (expectedFrontendIndex !== frontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message: `Frontend archive does not cover promised index ${frontendIndex}`,
    });
  }
});
