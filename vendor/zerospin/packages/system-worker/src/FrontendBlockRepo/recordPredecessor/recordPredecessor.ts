import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import {
  FrontendBlockSchema,
  FrontendLineageBlockSchema,
} from '@zerospin/core/session/FrontendBlockSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

/*
 * 1. Decode the identities persisted in the deterministic repository key.
 * 2. Accept either one complete predecessor descriptor or an explicit root.
 * 3. Persist the descriptor once; an exact retry is the only allowed rewrite.
 */
export const recordPredecessor = Effect.fn(
  'FrontendBlockRepo.recordPredecessor',
)(function* (props: {
  systemId: string;
  predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }> | null;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const { db, key, predecessor } = props;

  // 1 — malformed identities never enter the immutable lineage descriptor.
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.systemId).pipe(
    mapParseError({
      code: 'frontend-lineage-system-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'frontend-lineage-generation-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo generationId',
    }),
  );
  const accountId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.account),
  )(key.accountId).pipe(
    mapParseError({
      code: 'frontend-lineage-account-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo accountId',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(key.actorId).pipe(
    mapParseError({
      code: 'frontend-lineage-actor-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo actorId',
    }),
  );
  // 2 — partial or self-referential predecessors are never persisted.
  const predecessorGenerationId =
    predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.generation),
        )(predecessor.generationId).pipe(
          mapParseError({
            code: 'frontend-predecessor-generation-id-invalid',
            prefix:
              'Failed to decode FrontendBlockRepo predecessor generationId',
          }),
        );
  const predecessorRepoName =
    predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(systemWorkerAbbreviations.frontendBlockRepo),
        )(predecessor.repoName).pipe(
          mapParseError({
            code: 'frontend-predecessor-repo-name-invalid',
            prefix: 'Failed to decode FrontendBlockRepo predecessor repoName',
          }),
        );
  if (predecessor !== null) {
    if (
      !Number.isInteger(predecessor.terminalFrontendIndex) ||
      predecessor.terminalFrontendIndex < 0
    ) {
      return yield* new ZerospinError({
        code: 'frontend-predecessor-index-invalid',
        message: `FrontendBlockRepo predecessor terminal index must be a non-negative integer, received ${predecessor.terminalFrontendIndex}`,
      });
    }
    if (predecessorGenerationId === generationId) {
      return yield* new ZerospinError({
        code: 'frontend-predecessor-self-reference',
        message:
          'FrontendBlockRepo predecessor generation must differ from its generation',
      });
    }
  }
  const predecessorTerminalFrontendIndex =
    predecessor === null ? null : predecessor.terminalFrontendIndex;

  // 3 — retries may restate the same descriptor, but ancestry is immutable.
  const existing = db
    .select()
    .from(frontendBlockDrizzleSchemas.lineage)
    .where(eq(frontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (existing !== undefined) {
    const isExactRetry =
      existing.systemId === systemId &&
      existing.generationId === generationId &&
      existing.accountId === accountId &&
      existing.accountName === key.accountName &&
      existing.actorName === key.actorName &&
      existing.actorId === actorId &&
      existing.frontendName === key.frontendName &&
      existing.predecessorGenerationId === predecessorGenerationId &&
      existing.predecessorRepoName === predecessorRepoName &&
      existing.predecessorTerminalFrontendIndex ===
        predecessorTerminalFrontendIndex;
    if (!isExactRetry) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-conflict',
        message:
          'FrontendBlockRepo lineage is immutable and does not match the stored descriptor',
      });
    }
  } else {
    db.insert(frontendBlockDrizzleSchemas.lineage)
      .values({
        id: 'lineage',
        systemId,
        generationId,
        accountId,
        accountName: key.accountName,
        actorName: key.actorName,
        actorId,
        frontendName: key.frontendName,
        predecessorGenerationId,
        predecessorRepoName,
        predecessorTerminalFrontendIndex,
      })
      .run();
  }

  // Existing deployments stored raw FrontendBlock JSON. Once the authenticated
  // target lineage above is immutable, rewrite every row to its complete
  // lineage form in one DDL transaction. No steady-state decoder accepts the
  // legacy shape.
  const columns = db.all<{ name: string }>(
    sql.raw('PRAGMA table_info(frontendBlocks)'),
  );
  if (columns.find(column => column.name === 'block') === undefined) {
    return;
  }
  const legacyRows = db.all<{ frontendIndex: number; block: string }>(
    sql.raw(
      'SELECT frontendIndex, block FROM frontendBlocks ORDER BY frontendIndex ASC',
    ),
  );
  const migratedRows: Array<{
    frontendIndex: number;
    canonicalBytes: string;
  }> = [];
  let expectedFrontendIndex = 1;
  for (const legacyRow of legacyRows) {
    if (legacyRow.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'frontend-legacy-archive-index-gap',
        message: `Legacy frontend archive expected index ${expectedFrontendIndex}, received ${legacyRow.frontendIndex}`,
      });
    }
    const frontendBlock = yield* Schema.decodeUnknown(
      Schema.parseJson(FrontendBlockSchema),
    )(legacyRow.block).pipe(
      mapParseError({
        code: 'frontend-legacy-archive-row-invalid',
        prefix: `Failed to decode legacy frontend archive index ${legacyRow.frontendIndex}`,
      }),
    );
    if (
      frontendBlock.frontendName !== key.frontendName ||
      frontendBlock.frontendIndex !== legacyRow.frontendIndex
    ) {
      return yield* new ZerospinError({
        code: 'frontend-legacy-archive-target-mismatch',
        message: `Legacy frontend archive index ${legacyRow.frontendIndex} does not match its repository target`,
      });
    }
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(FrontendLineageBlockSchema),
    )({
      kind: 'frontend',
      systemId,
      generationId,
      accountId,
      accountName: key.accountName,
      actorId,
      actorName: key.actorName,
      frontendName: key.frontendName,
      frontendBlock,
    }).pipe(
      mapParseError({
        code: 'frontend-legacy-lineage-row-encode-failed',
        prefix: `Failed to encode migrated frontend archive index ${legacyRow.frontendIndex}`,
      }),
    );
    migratedRows.push({
      frontendIndex: legacyRow.frontendIndex,
      canonicalBytes,
    });
    expectedFrontendIndex += 1;
  }

  yield* Effect.try({
    try: () => {
      db.transaction(tx => {
        tx.run(
          sql.raw(
            'ALTER TABLE frontendBlocks RENAME TO frontendBlocks_legacy_034',
          ),
        );
        tx.run(
          sql.raw(
            'CREATE TABLE frontendBlocks (frontendIndex INTEGER NOT NULL UNIQUE, canonicalBytes TEXT NOT NULL, lineageBlock TEXT NOT NULL)',
          ),
        );
        for (const migratedRow of migratedRows) {
          tx.run(
            sql`INSERT INTO frontendBlocks (frontendIndex, canonicalBytes, lineageBlock) VALUES (${migratedRow.frontendIndex}, ${migratedRow.canonicalBytes}, ${migratedRow.canonicalBytes})`,
          );
        }
        tx.run(sql.raw('DROP TABLE frontendBlocks_legacy_034'));
      });
    },
    catch: ZerospinError.catch({
      code: 'frontend-legacy-archive-migration-failed',
      message: 'Failed to migrate legacy FrontendBlockRepo archive rows',
      preferCauseMessage: true,
    }),
  });
});
