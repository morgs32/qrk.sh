import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

export const getArchiveBound = Effect.fn(
  'AggregateFrontendBlockRepo.getArchiveBound',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<
  Readonly<{ generationId: string; frontendIndex: number }>,
  IAnyError
> {
  const { db, key } = props;
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

  const terminal = db
    .select({
      frontendIndex:
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
          .frontendIndex,
    })
    .from(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
    .orderBy(
      desc(
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
          .frontendIndex,
      ),
    )
    .limit(1)
    .get();

  return {
    generationId: key.generationId,
    frontendIndex:
      terminal?.frontendIndex ?? lineage.predecessorTerminalFrontendIndex ?? 0,
  };
});
