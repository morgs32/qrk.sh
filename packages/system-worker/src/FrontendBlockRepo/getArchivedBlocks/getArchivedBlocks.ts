import type { IDb } from '@zerospin/core/drizzle/types';
import { FrontendLineageBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendLineageBlock } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

/** Reads one exact, contiguous suffix from this physical generation segment. */
export const getArchivedBlocks = Effect.fn(
  'FrontendBlockRepo.getArchivedBlocks',
)(function* (props: {
  afterFrontendIndex: number;
  throughFrontendIndex: number;
  db: IDb;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<readonly IFrontendLineageBlock[], IAnyError> {
  const { afterFrontendIndex, db, key, throughFrontendIndex } = props;
  if (
    !Number.isInteger(afterFrontendIndex) ||
    afterFrontendIndex < 0 ||
    !Number.isInteger(throughFrontendIndex) ||
    throughFrontendIndex < afterFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'frontend-archive-range-invalid',
      message: `Invalid frontend archive range (${afterFrontendIndex}, ${throughFrontendIndex}]`,
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
  if (
    throughFrontendIndex >= firstLocalFrontendIndex &&
    afterFrontendIndex + 1 < firstLocalFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'frontend-archive-state-required',
      message:
        'Requested suffix begins before this physical frontend lineage segment',
    });
  }

  const rows = db
    .select()
    .from(frontendBlockDrizzleSchemas.frontendBlocks)
    .where(
      and(
        gt(
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          afterFrontendIndex,
        ),
        lte(
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          throughFrontendIndex,
        ),
      ),
    )
    .orderBy(asc(frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex))
    .all();

  const blocks: IFrontendLineageBlock[] = [];
  let expectedFrontendIndex = afterFrontendIndex + 1;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'frontend-archive-state-required',
        message: `Frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(FrontendLineageBlockSchema),
    )(row.canonicalBytes).pipe(
      mapParseError({
        code: 'frontend-archive-row-invalid',
        prefix: `Failed to decode frontend archive index ${row.frontendIndex}`,
      }),
    );
    const reencoded = yield* Schema.encode(
      Schema.parseJson(FrontendLineageBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'frontend-archive-row-invalid',
        prefix: `Failed to re-encode frontend archive index ${row.frontendIndex}`,
      }),
    );
    if (reencoded !== row.canonicalBytes) {
      return yield* new ZerospinError({
        code: 'frontend-archive-canonical-bytes-mismatch',
        message: `Frontend archive index ${row.frontendIndex} is not canonical`,
      });
    }
    blocks.push(block);
    expectedFrontendIndex += 1;
  }

  if (expectedFrontendIndex !== throughFrontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'frontend-archive-state-required',
      message: `Frontend archive does not contain suffix through index ${throughFrontendIndex}`,
    });
  }
  return blocks;
});
