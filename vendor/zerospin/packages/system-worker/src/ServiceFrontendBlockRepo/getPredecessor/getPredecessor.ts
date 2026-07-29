import type { IDb } from '@zerospin/core/drizzle/types';
import type { IActorId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

export const getPredecessor = Effect.fn(
  'ServiceFrontendBlockRepo.getPredecessor',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<
  Readonly<{
    systemId: ISystemId;
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
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
    .from(serviceFrontendBlockDrizzleSchemas.lineage)
    .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== key.generationId ||
    lineage.serviceName !== key.serviceName ||
    lineage.actorName !== key.actorName ||
    lineage.actorId !== key.actorId ||
    lineage.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message:
        'ServiceFrontendBlockRepo lineage is not configured for this exact target',
    });
  }
  if (
    (lineage.predecessorGenerationId === null &&
      (lineage.predecessorRepoName !== null ||
        lineage.predecessorTerminalFrontendIndex !== null)) ||
    (lineage.predecessorGenerationId !== null &&
      (lineage.predecessorRepoName === null ||
        lineage.predecessorTerminalFrontendIndex === null))
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-predecessor-descriptor-invalid',
      message:
        'ServiceFrontendBlockRepo predecessor descriptor is incomplete persisted state',
    });
  }
  const terminal = db
    .select({
      frontendIndex:
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
    })
    .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
    .orderBy(
      desc(
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
      ),
    )
    .limit(1)
    .get();
  return {
    systemId: lineage.systemId,
    generationId: lineage.generationId,
    serviceName: lineage.serviceName,
    actorName: lineage.actorName,
    actorId: lineage.actorId,
    frontendName: lineage.frontendName,
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
