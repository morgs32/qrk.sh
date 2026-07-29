import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

export const getArchiveBound = Effect.fn('FrontendBlockRepo.getArchiveBound')(
  function* (props: {
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
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

    const terminal = db
      .select({
        frontendIndex: frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
      })
      .from(frontendBlockDrizzleSchemas.frontendBlocks)
      .orderBy(desc(frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex))
      .limit(1)
      .get();

    return {
      generationId: key.generationId,
      frontendIndex:
        terminal?.frontendIndex ??
        lineage.predecessorTerminalFrontendIndex ??
        0,
    };
  },
);
