import type { IDb } from '@zerospin/core/drizzle/types';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

export const getArchivedBlocks = Effect.fn(
  'ServiceFrontendBlockRepo.getArchivedBlocks',
)(function* (props: {
  afterFrontendIndex: number;
  throughFrontendIndex: number;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
}): Effect.fn.Return<readonly IServiceFrontendBlock[], IAnyError> {
  if (
    !Number.isInteger(props.afterFrontendIndex) ||
    props.afterFrontendIndex < 0 ||
    !Number.isInteger(props.throughFrontendIndex) ||
    props.throughFrontendIndex < props.afterFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-range-invalid',
      message: `Invalid service frontend archive range (${props.afterFrontendIndex}, ${props.throughFrontendIndex}]`,
    });
  }
  if (props.serviceFrontendLock.frontendName !== props.key.frontendName) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message:
        'Service frontend archive lock does not match the requested frontend',
    });
  }
  const requestedModelVersions = new Map<string, string>();
  for (const model of Object.values(props.serviceFrontendLock.models)) {
    const existingVersion = requestedModelVersions.get(model.modelName);
    if (existingVersion !== undefined && existingVersion !== model.version) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-state-required',
        message: `Service frontend archive lock selects conflicting versions of ${model.modelName}`,
      });
    }
    requestedModelVersions.set(model.modelName, model.version);
  }
  const lineage = props.db
    .select()
    .from(serviceFrontendBlockDrizzleSchemas.lineage)
    .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (
    lineage === undefined ||
    lineage.generationId !== props.key.generationId ||
    lineage.serviceName !== props.key.serviceName ||
    lineage.userId !== props.key.userId ||
    lineage.frontendName !== props.key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message:
        'ServiceFrontendBlockRepo lineage is not configured for this exact target',
    });
  }
  if (
    props.throughFrontendIndex > props.afterFrontendIndex &&
    props.afterFrontendIndex < lineage.replayFloorFrontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-state-required',
      message: `Service frontend archive replay begins at index ${lineage.replayFloorFrontendIndex}`,
    });
  }
  for (const [modelName, modelVersion] of requestedModelVersions) {
    const coverage = props.db
      .select()
      .from(
        serviceFrontendBlockDrizzleSchemas.serviceFrontendModelVersionCoverage,
      )
      .where(
        and(
          eq(
            serviceFrontendBlockDrizzleSchemas
              .serviceFrontendModelVersionCoverage.modelName,
            modelName,
          ),
          eq(
            serviceFrontendBlockDrizzleSchemas
              .serviceFrontendModelVersionCoverage.modelVersion,
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
        code: 'service-frontend-archive-state-required',
        message: `Service frontend archive does not cover ${modelName}@${modelVersion} after index ${props.afterFrontendIndex}`,
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
      code: 'service-frontend-archive-state-required',
      message:
        'Requested suffix begins before this physical frontend lineage segment',
    });
  }
  const rows = props.db
    .select()
    .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
    .where(
      and(
        gt(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          props.afterFrontendIndex,
        ),
        lte(
          serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
            .frontendIndex,
          props.throughFrontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks.frontendIndex,
      ),
    )
    .all();
  const materializationRows = props.db
    .select()
    .from(
      serviceFrontendBlockDrizzleSchemas.serviceFrontendResourceMaterializations,
    )
    .where(
      and(
        gt(
          serviceFrontendBlockDrizzleSchemas
            .serviceFrontendResourceMaterializations.frontendIndex,
          props.afterFrontendIndex,
        ),
        lte(
          serviceFrontendBlockDrizzleSchemas
            .serviceFrontendResourceMaterializations.frontendIndex,
          props.throughFrontendIndex,
        ),
      ),
    )
    .orderBy(
      asc(
        serviceFrontendBlockDrizzleSchemas
          .serviceFrontendResourceMaterializations.frontendIndex,
      ),
      asc(
        serviceFrontendBlockDrizzleSchemas
          .serviceFrontendResourceMaterializations.deltaKind,
      ),
      asc(
        serviceFrontendBlockDrizzleSchemas
          .serviceFrontendResourceMaterializations.canonicalOrdinal,
      ),
      asc(
        serviceFrontendBlockDrizzleSchemas
          .serviceFrontendResourceMaterializations.modelName,
      ),
      asc(
        serviceFrontendBlockDrizzleSchemas
          .serviceFrontendResourceMaterializations.modelVersion,
      ),
    )
    .all();
  const blocks: IServiceFrontendBlock[] = [];
  let expectedFrontendIndex = props.afterFrontendIndex + 1;
  for (const row of rows) {
    if (row.frontendIndex !== expectedFrontendIndex) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-state-required',
        message: `Service service frontend archive is missing index ${expectedFrontendIndex}`,
      });
    }
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceFrontendBlockSchema),
    )(row.canonicalBytes).pipe(
      mapParseError({
        code: 'service-frontend-archive-row-invalid',
        prefix: `Failed to decode service frontend archive index ${row.frontendIndex}`,
      }),
    );
    const reencoded = yield* Schema.encode(
      Schema.parseJson(ServiceFrontendBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-frontend-archive-row-invalid',
        prefix: `Failed to re-encode service frontend archive index ${row.frontendIndex}`,
      }),
    );
    if (
      block.serviceName !== props.key.serviceName ||
      block.userId !== props.key.userId ||
      block.frontendName !== props.key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-target-mismatch',
        message: `Service frontend archive index ${row.frontendIndex} does not match its repository target`,
      });
    }
    if (
      block.frontendIndex !== row.frontendIndex ||
      reencoded !== row.canonicalBytes
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-canonical-bytes-mismatch',
        message: `Service service frontend archive index ${row.frontendIndex} is not canonical`,
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
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} has a missing inserted resource`,
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
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} is missing ${canonicalResource.modelName}@${modelVersion} inserted materialization ${canonicalOrdinal}`,
        });
      }
      const resource = yield* Schema.decodeUnknown(
        Schema.parseJson(EncodedResourceSchema),
      )(materialization.canonicalResourceBytes).pipe(
        mapParseError({
          code: 'service-frontend-archive-state-required',
          prefix: `Failed to decode service frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      const canonicalResourceBytes = yield* Schema.encode(
        Schema.parseJson(EncodedResourceSchema),
      )(resource).pipe(
        mapParseError({
          code: 'service-frontend-archive-state-required',
          prefix: `Failed to re-encode service frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      if (
        canonicalResourceBytes !== materialization.canonicalResourceBytes ||
        resource.modelName !== canonicalResource.modelName ||
        resource.version !== modelVersion
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} contains a corrupt ${canonicalResource.modelName}@${modelVersion} inserted materialization`,
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
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} has a missing updated resource`,
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
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} is missing ${canonicalResource.modelName}@${modelVersion} updated materialization ${canonicalOrdinal}`,
        });
      }
      const resource = yield* Schema.decodeUnknown(
        Schema.parseJson(EncodedResourceSchema),
      )(materialization.canonicalResourceBytes).pipe(
        mapParseError({
          code: 'service-frontend-archive-state-required',
          prefix: `Failed to decode service frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      const canonicalResourceBytes = yield* Schema.encode(
        Schema.parseJson(EncodedResourceSchema),
      )(resource).pipe(
        mapParseError({
          code: 'service-frontend-archive-state-required',
          prefix: `Failed to re-encode service frontend archive materialization at index ${row.frontendIndex}`,
        }),
      );
      if (
        canonicalResourceBytes !== materialization.canonicalResourceBytes ||
        resource.modelName !== canonicalResource.modelName ||
        resource.version !== modelVersion
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-archive-state-required',
          message: `Service frontend archive index ${row.frontendIndex} contains a corrupt ${canonicalResource.modelName}@${modelVersion} updated materialization`,
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
        code: 'service-frontend-archive-state-required',
        message: `Service frontend archive index ${row.frontendIndex} contains materializations without matching canonical resources`,
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
      code: 'service-frontend-archive-state-required',
      message: `Service service frontend archive does not contain suffix through index ${props.throughFrontendIndex}`,
    });
  }
  return blocks;
});
