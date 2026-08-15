import type { Async } from '@zerospin/core/async/Async';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendBlock } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { adaptFrontendResource } from '../../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

export const storeAggregateFrontendBlocks = Effect.fn(
  'AggregateFrontendBlockRepo.storeAggregateFrontendBlocks',
)(function* (props: {
  blocks: readonly IAggregateFrontendBlock[];
  db: IDb;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  broadcast: (block: IAggregateFrontendBlock) => Promise<void>;
}): Effect.fn.Return<void, IAnyError, Async> {
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(props.key.generationId).pipe(
    mapParseError({
      code: 'aggregate-frontend-archive-generation-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo generationId',
    }),
  );
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.key.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-archive-aggregate-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.key.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-archive-user-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo userId',
    }),
  );

  const aggregate = system.aggregates[props.key.aggregateName];
  const frontend = aggregate?.frontends[props.key.frontendName];
  if (
    aggregate === undefined ||
    frontend === undefined ||
    frontend.controller.kind !== 'aggregate' ||
    frontend.controller.aggregateName !== props.key.aggregateName ||
    frontend.controller.frontendName !== props.key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-archive-controller-missing',
      message:
        'The owning generation SystemSpec does not contain the aggregate frontend controller required by this archive',
      extra: {
        aggregateName: props.key.aggregateName,
        frontendName: props.key.frontendName,
      },
    });
  }
  const modelVersions: Array<{
    modelName: string;
    modelVersion: string;
  }> = [];
  for (const model of Object.values(frontend.controller.models)) {
    modelVersions.push({
      modelName: model.modelName,
      modelVersion: model.version,
    });
    for (const historicalDefinition of model.historicalDefinitions) {
      modelVersions.push({
        modelName: model.modelName,
        modelVersion: historicalDefinition.version,
      });
    }
  }

  const encodedBlocks: Array<{
    block: IAggregateFrontendBlock;
    canonicalBytes: string;
    frontendIndex: number;
    materializations: Array<{
      deltaKind: 'inserted' | 'updated';
      canonicalOrdinal: number;
      modelName: string;
      modelVersion: string;
      canonicalResourceBytes: string;
    }>;
  }> = [];
  for (const block of props.blocks) {
    if (!Number.isInteger(block.frontendIndex) || block.frontendIndex < 1) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-index-invalid',
        message: `Frontend archive index must be a positive integer, received ${block.frontendIndex}`,
      });
    }
    if (block.frontendName !== props.key.frontendName) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-archive-target-mismatch',
        message: 'Frontend block does not match its archive target',
        extra: {
          expectedFrontendName: props.key.frontendName,
          receivedFrontendName: block.frontendName,
        },
      });
    }
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(AggregateFrontendBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'aggregate-frontend-block-encode-failed',
        prefix: `Failed to encode frontend block ${block.frontendIndex}`,
      }),
    );
    const materializations: Array<{
      deltaKind: 'inserted' | 'updated';
      canonicalOrdinal: number;
      modelName: string;
      modelVersion: string;
      canonicalResourceBytes: string;
    }> = [];
    for (
      let canonicalOrdinal = 0;
      canonicalOrdinal < block.delta.inserted.length;
      canonicalOrdinal += 1
    ) {
      const resource = block.delta.inserted[canonicalOrdinal];
      if (resource === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-materialization-resource-missing',
          message: `Frontend block ${block.frontendIndex} inserted resource ${canonicalOrdinal} is missing`,
        });
      }
      const model = Object.values(frontend.controller.models).find(
        candidate => candidate.modelName === resource.modelName,
      );
      if (model === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-materialization-model-missing',
          message: `Frontend block ${block.frontendIndex} contains unknown model ${resource.modelName}`,
        });
      }
      for (const modelVersion of [
        model.version,
        ...model.historicalDefinitions.map(
          historicalDefinition => historicalDefinition.version,
        ),
      ]) {
        const adaptedUnknown = yield* adaptFrontendResource({
          owner: {
            kind: 'aggregate',
            aggregateName: props.key.aggregateName,
          },
          frontendName: props.key.frontendName,
          modelName: resource.modelName,
          modelVersion,
          resource,
        });
        const adapted = yield* Schema.decodeUnknown(
          Schema.Struct({
            modelName: Schema.String,
            resource: EncodedResourceSchema,
          }),
        )(adaptedUnknown, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'aggregate-frontend-archive-materialization-adapter-result-invalid',
            prefix:
              'The owning generation runtime returned an invalid materialized frontend resource',
          }),
        );
        if (
          adapted.modelName !== resource.modelName ||
          adapted.resource.modelName !== resource.modelName ||
          adapted.resource.version !== modelVersion
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-archive-materialization-adapter-identity-mismatch',
            message:
              'The owning generation runtime changed the model identity of a materialized frontend resource',
            extra: {
              expectedModelName: resource.modelName,
              expectedModelVersion: modelVersion,
              receivedModelName: adapted.modelName,
              receivedResourceModelName: adapted.resource.modelName,
              receivedModelVersion: adapted.resource.version,
            },
          });
        }
        const canonicalResourceBytes = yield* Schema.encode(
          Schema.parseJson(EncodedResourceSchema),
        )(adapted.resource).pipe(
          mapParseError({
            code: 'aggregate-frontend-archive-materialization-encode-failed',
            prefix: `Failed to encode frontend resource ${resource.modelName}@${modelVersion}`,
          }),
        );
        materializations.push({
          deltaKind: 'inserted',
          canonicalOrdinal,
          modelName: resource.modelName,
          modelVersion,
          canonicalResourceBytes,
        });
      }
    }
    for (
      let canonicalOrdinal = 0;
      canonicalOrdinal < block.delta.updated.length;
      canonicalOrdinal += 1
    ) {
      const resource = block.delta.updated[canonicalOrdinal];
      if (resource === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-materialization-resource-missing',
          message: `Frontend block ${block.frontendIndex} updated resource ${canonicalOrdinal} is missing`,
        });
      }
      const model = Object.values(frontend.controller.models).find(
        candidate => candidate.modelName === resource.modelName,
      );
      if (model === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-archive-materialization-model-missing',
          message: `Frontend block ${block.frontendIndex} contains unknown model ${resource.modelName}`,
        });
      }
      for (const modelVersion of [
        model.version,
        ...model.historicalDefinitions.map(
          historicalDefinition => historicalDefinition.version,
        ),
      ]) {
        const adaptedUnknown = yield* adaptFrontendResource({
          owner: {
            kind: 'aggregate',
            aggregateName: props.key.aggregateName,
          },
          frontendName: props.key.frontendName,
          modelName: resource.modelName,
          modelVersion,
          resource,
        });
        const adapted = yield* Schema.decodeUnknown(
          Schema.Struct({
            modelName: Schema.String,
            resource: EncodedResourceSchema,
          }),
        )(adaptedUnknown, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'aggregate-frontend-archive-materialization-adapter-result-invalid',
            prefix:
              'The owning generation runtime returned an invalid materialized frontend resource',
          }),
        );
        if (
          adapted.modelName !== resource.modelName ||
          adapted.resource.modelName !== resource.modelName ||
          adapted.resource.version !== modelVersion
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-archive-materialization-adapter-identity-mismatch',
            message:
              'The owning generation runtime changed the model identity of a materialized frontend resource',
            extra: {
              expectedModelName: resource.modelName,
              expectedModelVersion: modelVersion,
              receivedModelName: adapted.modelName,
              receivedResourceModelName: adapted.resource.modelName,
              receivedModelVersion: adapted.resource.version,
            },
          });
        }
        const canonicalResourceBytes = yield* Schema.encode(
          Schema.parseJson(EncodedResourceSchema),
        )(adapted.resource).pipe(
          mapParseError({
            code: 'aggregate-frontend-archive-materialization-encode-failed',
            prefix: `Failed to encode frontend resource ${resource.modelName}@${modelVersion}`,
          }),
        );
        materializations.push({
          deltaKind: 'updated',
          canonicalOrdinal,
          modelName: resource.modelName,
          modelVersion,
          canonicalResourceBytes,
        });
      }
    }
    encodedBlocks.push({
      block,
      canonicalBytes,
      frontendIndex: block.frontendIndex,
      materializations,
    });
  }

  const insertedBlocks = yield* makeTx({
    db: props.db,
    program: Effect.fn(
      'AggregateFrontendBlockRepo.storeAggregateFrontendBlocks.transaction',
    )(function* ({ tx }) {
      const lineage = tx
        .select()
        .from(aggregateFrontendBlockDrizzleSchemas.lineage)
        .where(eq(aggregateFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
        .get();
      if (
        lineage === undefined ||
        lineage.generationId !== generationId ||
        lineage.aggregateId !== aggregateId ||
        lineage.aggregateName !== props.key.aggregateName ||
        lineage.userId !== userId ||
        lineage.frontendName !== props.key.frontendName
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-lineage-target-mismatch',
          message:
            'AggregateFrontendBlockRepo stored lineage does not match its repository target',
        });
      }
      const terminalRow = tx
        .select({
          frontendIndex:
            aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
              .frontendIndex,
        })
        .from(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
        .orderBy(
          desc(
            aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
              .frontendIndex,
          ),
        )
        .limit(1)
        .get();
      let terminalFrontendIndex =
        terminalRow?.frontendIndex ??
        lineage.predecessorTerminalFrontendIndex ??
        0;
      for (const modelVersion of modelVersions) {
        const existingCoverage = tx
          .select()
          .from(
            aggregateFrontendBlockDrizzleSchemas.aggregateFrontendModelVersionCoverage,
          )
          .where(
            and(
              eq(
                aggregateFrontendBlockDrizzleSchemas
                  .aggregateFrontendModelVersionCoverage.modelName,
                modelVersion.modelName,
              ),
              eq(
                aggregateFrontendBlockDrizzleSchemas
                  .aggregateFrontendModelVersionCoverage.modelVersion,
                modelVersion.modelVersion,
              ),
            ),
          )
          .get();
        if (existingCoverage === undefined) {
          tx.insert(
            aggregateFrontendBlockDrizzleSchemas.aggregateFrontendModelVersionCoverage,
          )
            .values({
              modelName: modelVersion.modelName,
              modelVersion: modelVersion.modelVersion,
              replayFloorFrontendIndex: terminalFrontendIndex,
            })
            .run();
          continue;
        }
        if (existingCoverage.replayFloorFrontendIndex > terminalFrontendIndex) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-archive-materialization-coverage-invalid',
            message: `Frontend archive coverage for ${modelVersion.modelName}@${modelVersion.modelVersion} begins after its terminal index`,
          });
        }
      }
      const newlyInserted: IAggregateFrontendBlock[] = [];
      for (const encoded of encodedBlocks) {
        const existing = tx
          .select({
            canonicalBytes:
              aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
                .canonicalBytes,
          })
          .from(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
          .where(
            eq(
              aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks
                .frontendIndex,
              encoded.frontendIndex,
            ),
          )
          .get();
        if (existing !== undefined) {
          if (existing.canonicalBytes === encoded.canonicalBytes) {
            continue;
          }
          return yield* new ZerospinError({
            code: 'aggregate-frontend-archive-conflicting-duplicate',
            message: `Frontend archive index ${encoded.frontendIndex} already exists with different canonical bytes`,
          });
        }
        if (encoded.frontendIndex !== terminalFrontendIndex + 1) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-archive-index-gap',
            message: `Frontend archive expected index ${terminalFrontendIndex + 1}, received ${encoded.frontendIndex}`,
            extra: {
              terminalFrontendIndex,
              receivedFrontendIndex: encoded.frontendIndex,
            },
          });
        }
        tx.insert(aggregateFrontendBlockDrizzleSchemas.aggregateFrontendBlocks)
          .values({
            frontendIndex: encoded.frontendIndex,
            canonicalBytes: encoded.canonicalBytes,
            frontendBlock: encoded.canonicalBytes,
          })
          .run();
        for (const materialization of encoded.materializations) {
          tx.insert(
            aggregateFrontendBlockDrizzleSchemas.aggregateFrontendResourceMaterializations,
          )
            .values({
              frontendIndex: encoded.frontendIndex,
              deltaKind: materialization.deltaKind,
              canonicalOrdinal: materialization.canonicalOrdinal,
              modelName: materialization.modelName,
              modelVersion: materialization.modelVersion,
              canonicalResourceBytes: materialization.canonicalResourceBytes,
            })
            .run();
        }
        terminalFrontendIndex = encoded.frontendIndex;
        newlyInserted.push(encoded.block);
      }
      return newlyInserted;
    }),
  });

  for (const block of insertedBlocks) {
    yield* Effect.promise(() => props.broadcast(block).catch(() => undefined));
  }
});
