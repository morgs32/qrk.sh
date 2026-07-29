import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

export const getPredecessor = Effect.fn('FrontendBlockRepo.getPredecessor')(
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
    if (
      (lineage.predecessorGenerationId === null &&
        (lineage.predecessorRepoName !== null ||
          lineage.predecessorTerminalFrontendIndex !== null)) ||
      (lineage.predecessorGenerationId !== null &&
        (lineage.predecessorRepoName === null ||
          lineage.predecessorTerminalFrontendIndex === null))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-predecessor-descriptor-invalid',
        message:
          'FrontendBlockRepo predecessor descriptor is incomplete persisted state',
      });
    }
    return {
      systemId: lineage.systemId,
      generationId: lineage.generationId,
      terminalFrontendIndex:
        terminal?.frontendIndex ??
        lineage.predecessorTerminalFrontendIndex ??
        0,
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
  },
);
