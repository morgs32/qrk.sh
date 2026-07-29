import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLineageBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendLineageBlock } from '@zerospin/core/serviceSession/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

/** Reads one exact, contiguous suffix from this physical generation segment. */
export const getArchivedBlocks = Effect.fn(
  'ServiceFrontendBlockRepo.getArchivedBlocks',
)(function* (props: {
  afterFrontendIndex: number;
  throughFrontendIndex: number;
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
}): Effect.fn.Return<readonly IServiceFrontendLineageBlock[], IAnyError> {
  const { afterFrontendIndex, db, key, throughFrontendIndex } = props;
  if (
    !Number.isInteger(afterFrontendIndex) ||
    afterFrontendIndex < 0 ||
    !Number.isInteger(throughFrontendIndex) ||
    throughFrontendIndex < afterFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-range-invalid',
      message: `Invalid service frontend archive range (${afterFrontendIndex}, ${throughFrontendIndex}]`,
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
  if (
    throughFrontendIndex >= firstLocalFrontendIndex &&
    afterFrontendIndex + 1 < firstLocalFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message:
        'Requested suffix begins before this physical service frontend lineage segment',
    });
  }

  const rows = db
    .select()
    .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
    .where(
      and(
        gt(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          afterFrontendIndex,
        ),
        lte(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          throughFrontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
      ),
    )
    .all();

  const blocks: IServiceFrontendLineageBlock[] = [];
  let expectedFrontendIndex = afterFrontendIndex + 1;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-state-required',
        message: `Service frontend archive is missing index ${expectedFrontendIndex}`,
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
    const reencoded = yield* Schema.encode(
      Schema.parseJson(ServiceFrontendLineageBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-frontend-archive-row-invalid',
        prefix: `Failed to re-encode service frontend archive index ${row.frontendIndex}`,
      }),
    );
    if (reencoded !== row.canonicalBytes) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-canonical-bytes-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} is not canonical`,
      });
    }
    blocks.push(block);
    expectedFrontendIndex += 1;
  }

  if (expectedFrontendIndex !== throughFrontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message: `Service frontend archive does not contain suffix through index ${throughFrontendIndex}`,
    });
  }
  return blocks;
});
