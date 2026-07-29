import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

export const getArchiveBound = Effect.fn(
  'ServiceFrontendBlockRepo.getArchiveBound',
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
  Readonly<{ generationId: string; frontendIndex: number }>,
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
    generationId: key.generationId,
    frontendIndex:
      terminal?.frontendIndex ?? lineage.predecessorTerminalFrontendIndex ?? 0,
  };
});
