import type { IDb } from '@zerospin/core/drizzle/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendBlock } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

export const getArchivedBlocks = Effect.fn(
  'AggregateFrontendBlockRepo.getArchivedBlocks',
)(function* (props: {
  afterFrontendIndex: number;
  throughFrontendIndex: number;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<readonly IAggregateFrontendBlock[], IAnyError> {
  if (
    !Number.isInteger(props.afterFrontendIndex) ||
    props.afterFrontendIndex < 0 ||
    !Number.isInteger(props.throughFrontendIndex) ||
    props.throughFrontendIndex < props.afterFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-range-invalid',
      message: `Invalid frontend archive range (${props.afterFrontendIndex}, ${props.throughFrontendIndex}]`,
    });
  }
  if (props.aggregateFrontendLock.frontendName !== props.key.frontendName) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message: 'Frontend archive lock does not match the requested frontend',
    });
  }
  const requestedModelVersions = new Map<string, string>();
  for (const model of Object.values(props.aggregateFrontendLock.models)) {
    const existingVersion = requestedModelVersions.get(model.modelName);
    if (existingVersion !== undefined && existingVersion !== model.version) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-state-required',
        message: `Frontend archive lock selects conflicting versions of ${model.modelName}`,
      });
    }
    requestedModelVersions.set(model.modelName, model.version);
  }
  const lineage = props.db
    .select()
    .from(aggregateFrontendBlockDrizzleSchemas.lineage)
    .where(eq(aggregateFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== props.key.generationId ||
    lineage.aggregateId !== props.key.aggregateId ||
    lineage.aggregateName !== props.key.aggregateName ||
    lineage.userId !== props.key.userId ||
    lineage.frontendName !== props.key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message:
        'AggregateFrontendBlockRepo lineage is not configured for this exact target',
    });
  }
  if (
    props.throughFrontendIndex > props.afterFrontendIndex &&
    props.afterFrontendIndex < lineage.replayFloorFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message: `Frontend archive replay begins at index ${lineage.replayFloorFrontendIndex}`,
    });
  }
  for (const [modelName, modelVersion] of requestedModelVersions) {
    const coverage = props.db
      .select()
      .from(
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendModelVersionCoverage,
      )
      .where(
        and(
          eq(
            aggregateFrontendBlockDrizzleSchemas
              .aggregateFrontendModelVersionCoverage.modelName,
            modelName,
          ),
          eq(
            aggregateFrontendBlockDrizzleSchemas
              .aggregateFrontendModelVersionCoverage.modelVersion,
            modelVersion,
          ),
        ),
      )
      .get();
    if (
      props.throughFrontendIndex > props.afterFrontendIndex &&
      (coverage === undefined ||
        props.afterFrontendIndex < coverage.replayFloorFrontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-state-required',
        message: `Frontend archive does not cover ${modelName}@${modelVersion} after index ${props.afterFrontendIndex}`,
      });
    }
  }
  const firstLocalFrontendIndex =
    (lineage.predecessorTerminalFrontendIndex ?? 0) + 1;
  if (
    props.throughFrontendIndex >= firstLocalFrontendIndex &&
    props.afterFrontendIndex + 1 < firstLocalFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message:
        'Requested suffix begins before this physical frontend lineage segment',
    });
  }
  const rows = props.db
    .select()
    .from(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
    .where(
      and(
        gt(
          aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
            .frontendIndex,
          props.afterFrontendIndex,
        ),
        lte(
          aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
            .frontendIndex,
          props.throughFrontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
          .frontendIndex,
      ),
    )
    .all();
  const materializationRows = props.db
    .select()
    .from(
      aggregateFrontendBlockDrizzleSchemas.aggregateFrontendResourceMaterializations,
    )
    .where(
      and(
        gt(
          aggregateFrontendBlockDrizzleSchemas
            .aggregateFrontendResourceMaterializations.frontendIndex,
          props.afterFrontendIndex,
        ),
        lte(
          aggregateFrontendBlockDrizzleSchemas
            .aggregateFrontendResourceMaterializations.frontendIndex,
          props.throughFrontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        aggregateFrontendBlockDrizzleSchemas
          .aggregateFrontendResourceMaterializations.frontendIndex,
      ),
      asc(
        aggregateFrontendBlockDrizzleSchemas
          .aggregateFrontendResourceMaterializations.deltaKind,
      ),
      asc(
        aggregateFrontendBlockDrizzleSchemas
          .aggregateFrontendResourceMaterializations.canonicalOrdinal,
      ),
      asc(
        aggregateFrontendBlockDrizzleSchemas
          .aggregateFrontendResourceMaterializations.modelName,
      ),
      asc(
        aggregateFrontendBlockDrizzleSchemas
          .aggregateFrontendResourceMaterializations.modelVersion,
      ),
    )
    .all();
  const blocks: IAggregateFrontendBlock[] = [];
  let expectedFrontendIndex = props.afterFrontendIndex + 1;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-state-required',
        message: `Frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(AggregateFrontendBlockSchema),
    )(row.canonicalBytes).pipe(
      mapParseError({
        code: 'aggregate-frontend-archive-row-invalid',
        prefix: `Failed to decode frontend archive index ${row.frontendIndex}`,
      }),
    );
    const reencoded = yield* Schema.encode(
      Schema.parseJson(AggregateFrontendBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'aggregate-frontend-archive-row-invalid',
        prefix: `Failed to re-encode frontend archive index ${row.frontendIndex}`,
      }),
    );
    if (
      block.frontendIndex !== row.frontendIndex ||
      block.frontendName !== props.key.frontendName ||
      reencoded !== row.canonicalBytes
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-canonical-bytes-mismatch',
        message: `Frontend archive index ${row.frontendIndex} is not canonical`,
      });
    }
    const inserted: IEncodedResourceShape[] = [];
    const updated: IEncodedResourceShape[] = [];
    let selectedMaterializationCount = 0;
    for (
      let canonicalOrdinal = 0;
      canonicalOrdinal < block.delta.inserted.length;
      canonicalOrdinal += 1
    ) {
      const canonicalResource = block.delta.inserted[canonicalOrdinal];
      if (canonicalResource === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} has a missing inserted resource`,
        });
      }
      const modelVersion = requestedModelVersions.get(
        canonicalResource.modelName,
      );
      if (modelVersion === undefined) {
        continue;
      }
      const materialization = materializationRows.find(
        candidate =>
          candidate.frontendIndex === row.frontendIndex &&
          candidate.deltaKind === 'inserted' &&
          candidate.canonicalOrdinal === canonicalOrdinal &&
          candidate.modelName === canonicalResource.modelName &&
          candidate.modelVersion === modelVersion,
      );
      if (materialization === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} is missing ${canonicalResource.modelName}@${modelVersion} inserted materialization ${canonicalOrdinal}`,
        });
      }
      const resource = yield* Schema.decodeUnknown(
        Schema.parseJson(EncodedResourceSchema),
      )(materialization.canonicalResourceBytes).pipe(
        mapParseError({
          code: 'aggregate-frontend-archive-state-required',
          prefix: `Failed to decode frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      const canonicalResourceBytes = yield* Schema.encode(
        Schema.parseJson(EncodedResourceSchema),
      )(resource).pipe(
        mapParseError({
          code: 'aggregate-frontend-archive-state-required',
          prefix: `Failed to re-encode frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      if (
        canonicalResourceBytes !== materialization.canonicalResourceBytes ||
        resource.modelName !== canonicalResource.modelName ||
        resource.version !== modelVersion
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} contains a corrupt ${canonicalResource.modelName}@${modelVersion} inserted materialization`,
        });
      }
      inserted.push(resource);
      selectedMaterializationCount += 1;
    }
    for (
      let canonicalOrdinal = 0;
      canonicalOrdinal < block.delta.updated.length;
      canonicalOrdinal += 1
    ) {
      const canonicalResource = block.delta.updated[canonicalOrdinal];
      if (canonicalResource === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} has a missing updated resource`,
        });
      }
      const modelVersion = requestedModelVersions.get(
        canonicalResource.modelName,
      );
      if (modelVersion === undefined) {
        continue;
      }
      const materialization = materializationRows.find(
        candidate =>
          candidate.frontendIndex === row.frontendIndex &&
          candidate.deltaKind === 'updated' &&
          candidate.canonicalOrdinal === canonicalOrdinal &&
          candidate.modelName === canonicalResource.modelName &&
          candidate.modelVersion === modelVersion,
      );
      if (materialization === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} is missing ${canonicalResource.modelName}@${modelVersion} updated materialization ${canonicalOrdinal}`,
        });
      }
      const resource = yield* Schema.decodeUnknown(
        Schema.parseJson(EncodedResourceSchema),
      )(materialization.canonicalResourceBytes).pipe(
        mapParseError({
          code: 'aggregate-frontend-archive-state-required',
          prefix: `Failed to decode frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      const canonicalResourceBytes = yield* Schema.encode(
        Schema.parseJson(EncodedResourceSchema),
      )(resource).pipe(
        mapParseError({
          code: 'aggregate-frontend-archive-state-required',
          prefix: `Failed to re-encode frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      if (
        canonicalResourceBytes !== materialization.canonicalResourceBytes ||
        resource.modelName !== canonicalResource.modelName ||
        resource.version !== modelVersion
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-state-required',
          message: `Frontend archive index ${row.frontendIndex} contains a corrupt ${canonicalResource.modelName}@${modelVersion} updated materialization`,
        });
      }
      updated.push(resource);
      selectedMaterializationCount += 1;
    }
    const selectedRowsForBlock = materializationRows.filter(
      materialization =>
        materialization.frontendIndex === row.frontendIndex &&
        requestedModelVersions.get(materialization.modelName) ===
          materialization.modelVersion,
    );
    if (selectedRowsForBlock.length !== selectedMaterializationCount) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-state-required',
        message: `Frontend archive index ${row.frontendIndex} contains materializations without matching canonical resources`,
      });
    }
    blocks.push({
      ...block,
      delta: {
        inserted,
        updated,
        deleted: block.delta.deleted.filter(deleted =>
          requestedModelVersions.has(deleted.modelName),
        ),
      },
    });
    expectedFrontendIndex += 1;
  }
  if (expectedFrontendIndex !== props.throughFrontendIndex + 1) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-state-required',
      message: `Frontend archive does not contain suffix through index ${props.throughFrontendIndex}`,
    });
  }
  return blocks;
});
