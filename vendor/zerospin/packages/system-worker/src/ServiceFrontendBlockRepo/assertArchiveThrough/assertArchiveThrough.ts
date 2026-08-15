import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

/* Ticket creation uses this as the strict state-to-archive readiness barrier. */
export const assertArchiveThrough = Effect.fn(
  'ServiceFrontendBlockRepo.assertArchiveThrough',
)(function* (props: {
  frontendIndex: number;
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { db, frontendIndex, key } = props;
  if (!Number.isInteger(frontendIndex) || frontendIndex < 0) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-readiness-index-invalid',
      message: `Service service frontend archive readiness index must be a non-negative integer, received ${frontendIndex}`,
    });
  }

  const lineage = db
    .select()
    .from(serviceFrontendBlockDrizzleSchemas.lineage)
    .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== key.generationId ||
    lineage.serviceName !== key.serviceName ||
    lineage.userId !== key.userId ||
    lineage.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message:
        'ServiceFrontendBlockRepo lineage is not configured for this exact target',
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
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
    })
    .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
    .where(
      and(
        gte(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          firstLocalFrontendIndex,
        ),
        lte(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          frontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
      ),
    )
    .all();

  let expectedFrontendIndex = firstLocalFrontendIndex;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-state-required',
        message: `Service service frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    expectedFrontendIndex += 1;
  }
  if (expectedFrontendIndex !== frontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message: `Service service frontend archive does not cover promised index ${frontendIndex}`,
    });
  }
});
