import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

export const getPredecessor = Effect.fn(
  'AggregateFrontendBlockRepo.getPredecessor',
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
  Readonly<{
    systemId: ISystemId;
    generationId: string;
    terminalFrontendIndex: number;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }> | null;
  }>,
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
  if (
    (lineage.predecessorGenerationId === null &&
      (lineage.predecessorRepoName !== null ||
        lineage.predecessorTerminalFrontendIndex !== null)) ||
    (lineage.predecessorGenerationId !== null &&
      (lineage.predecessorRepoName === null ||
        lineage.predecessorTerminalFrontendIndex === null))
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-predecessor-descriptor-invalid',
      message:
        'AggregateFrontendBlockRepo predecessor descriptor is incomplete persisted state',
    });
  }
  return {
    systemId: lineage.systemId,
    generationId: lineage.generationId,
    terminalFrontendIndex:
      terminal?.frontendIndex ?? lineage.predecessorTerminalFrontendIndex ?? 0,
    predecessor:
      lineage.predecessorGenerationId === null ||
      lineage.predecessorRepoName === null ||
      lineage.predecessorTerminalFrontendIndex === null
        ? null
        : {
            generationId: lineage.predecessorGenerationId,
            repoName: lineage.predecessorRepoName,
            terminalFrontendIndex: lineage.predecessorTerminalFrontendIndex,
          },
  };
});
