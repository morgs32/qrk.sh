import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLineageBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

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
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError> {
  const { db, frontendIndex, key } = props;
  if (!Number.isInteger(frontendIndex) || frontendIndex < 0) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-readiness-index-invalid',
      message: `Service frontend archive readiness index must be a non-negative integer, received ${frontendIndex}`,
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

  const firstLocalFrontendIndex =
    (lineage.predecessorTerminalFrontendIndex ?? 0) + 1;
  if (frontendIndex < firstLocalFrontendIndex) {
    return;
  }
  const rows = db
    .select()
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
        message: `Service frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    if (row.lineageBlock !== row.canonicalBytes) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-canonical-bytes-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} has divergent replay bytes`,
      });
    }
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceFrontendLineageBlockSchema),
    )(row.canonicalBytes).pipe(
      mapParseError({
        code: 'service-frontend-archive-row-invalid',
        prefix: `Failed to decode service frontend archive index ${row.frontendIndex}`,
      }),
    );
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(ServiceFrontendLineageBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-frontend-archive-row-invalid',
        prefix: `Failed to re-encode service frontend archive index ${row.frontendIndex}`,
      }),
    );
    if (canonicalBytes !== row.canonicalBytes) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-canonical-bytes-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} is not canonical`,
      });
    }
    const blockFrontendIndex =
      block.kind === 'generation-boundary'
        ? block.frontendIndex
        : block.frontendBlock.frontendIndex;
    if (
      row.frontendIndex !== blockFrontendIndex ||
      row.systemId !== lineage.systemId ||
      row.systemId !== block.systemId ||
      row.generationId !== key.generationId ||
      row.generationId !== block.generationId ||
      row.serviceName !== key.serviceName ||
      row.serviceName !== block.serviceName ||
      row.actorName !== key.actorName ||
      row.actorName !== block.actorName ||
      row.actorId !== key.actorId ||
      row.actorId !== block.actorId ||
      row.frontendName !== key.frontendName ||
      row.frontendName !== block.frontendName ||
      row.kind !== block.kind
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-target-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} does not match its immutable lineage target`,
      });
    }
    if (
      block.kind === 'service-frontend' &&
      (block.frontendBlock.serviceName !== key.serviceName ||
        block.frontendBlock.actorName !== key.actorName ||
        block.frontendBlock.actorId !== key.actorId ||
        block.frontendBlock.frontendName !== key.frontendName)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-inner-target-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} wraps a block for a different target`,
      });
    }
    if (
      block.kind === 'generation-boundary' &&
      (lineage.predecessorGenerationId === null ||
        lineage.predecessorTerminalFrontendIndex === null ||
        block.prevGenerationId !== lineage.predecessorGenerationId ||
        block.frontendIndex !== lineage.predecessorTerminalFrontendIndex + 1)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-boundary-predecessor-mismatch',
        message: `Service frontend archive boundary ${row.frontendIndex} does not match immutable predecessor lineage`,
      });
    }
    expectedFrontendIndex += 1;
  }
  if (expectedFrontendIndex !== frontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message: `Service frontend archive does not cover promised index ${frontendIndex}`,
    });
  }
});
