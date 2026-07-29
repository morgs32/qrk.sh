import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Effect } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

/* Ticket creation uses this as the strict state-to-archive readiness barrier. */
export const assertArchiveThrough = Effect.fn(
  'FrontendBlockRepo.assertArchiveThrough',
)(function* (props: {
  frontendIndex: number;
  db: IDb;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { db, frontendIndex, key } = props;
  if (!Number.isInteger(frontendIndex) || frontendIndex < 0) {
    return yield* new ZerospinError({
      code: 'frontend-archive-readiness-index-invalid',
      message: `Frontend archive readiness index must be a non-negative integer, received ${frontendIndex}`,
    });
  }

  const lineage = db
    .select()
    .from(frontendBlockDrizzleSchemas.lineage)
    .where(eq(frontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== key.generationId ||
    lineage.accountId !== key.accountId ||
    lineage.accountName !== key.accountName ||
    lineage.actorName !== key.actorName ||
    lineage.actorId !== key.actorId ||
    lineage.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'frontend-archive-state-required',
      message:
        'FrontendBlockRepo lineage is not configured for this exact target',
    });
  }

  const firstLocalFrontendIndex =
    (lineage.predecessorTerminalFrontendIndex ?? 0) + 1;
  if (frontendIndex < firstLocalFrontendIndex) {
    return;
  }
  const rows = db
    .select({
      frontendIndex: frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
    })
    .from(frontendBlockDrizzleSchemas.frontendBlocks)
    .where(
      and(
        gte(
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          firstLocalFrontendIndex,
        ),
        lte(
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          frontendIndex,
        ),
      ),
    )
    .orderBy(asc(frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex))
    .all();

  let expectedFrontendIndex = firstLocalFrontendIndex;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'frontend-archive-state-required',
        message: `Frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    expectedFrontendIndex += 1;
  }
  if (expectedFrontendIndex !== frontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'frontend-archive-state-required',
      message: `Frontend archive does not cover promised index ${frontendIndex}`,
    });
  }
});
