import type { Async } from '@zerospin/core/async/Async';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { adaptFrontendResource } from '../../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

export const storeServiceFrontendBlocks = Effect.fn(
  'ServiceFrontendBlockRepo.storeServiceFrontendBlocks',
)(function* (props: {
  blocks: readonly IServiceFrontendBlock[];
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
  broadcast: (block: IServiceFrontendBlock) => Promise<void>;
}): Effect.fn.Return<void, IAnyError, Async> {
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(props.key.generationId).pipe(
    mapParseError({
      code: 'service-frontend-archive-generation-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo generationId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.key.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-archive-user-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo userId',
    }),
  );

  const service = system.services[props.key.serviceName];
  const frontend = service?.frontends[props.key.frontendName];
  if (
    service === undefined ||
    frontend === undefined ||
    frontend.controller.kind !== 'service' ||
    frontend.controller.serviceName !== props.key.serviceName ||
    frontend.controller.frontendName !== props.key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-archive-controller-missing',
      message:
        'The owning generation SystemSpec does not contain the service frontend controller required by this archive',
      extra: {
        serviceName: props.key.serviceName,
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
    block: IServiceFrontendBlock;
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
        code: 'service-frontend-archive-index-invalid',
        message: `Service service frontend archive index must be a positive integer, received ${block.frontendIndex}`,
      });
    }
    if (
      block.serviceName !== props.key.serviceName ||
      block.userId !== userId ||
      block.frontendName !== props.key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-target-mismatch',
        message: 'Frontend block does not match its archive target',
        extra: {
          expectedServiceName: props.key.serviceName,
          receivedServiceName: block.serviceName,
          expectedUserId: userId,
          receivedUserId: block.userId,
          expectedFrontendName: props.key.frontendName,
          receivedFrontendName: block.frontendName,
        },
      });
    }
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(ServiceFrontendBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-frontend-block-encode-failed',
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
          code: 'service-frontend-archive-materialization-resource-missing',
          message: `Service frontend block ${block.frontendIndex} inserted resource ${canonicalOrdinal} is missing`,
        });
      }
      const model = Object.values(frontend.controller.models).find(
        candidate => candidate.modelName === resource.modelName,
      );
      if (model === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-archive-materialization-model-missing',
          message: `Service frontend block ${block.frontendIndex} contains unknown model ${resource.modelName}`,
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
            kind: 'service',
            serviceName: props.key.serviceName,
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
            code: 'service-frontend-archive-materialization-adapter-result-invalid',
            prefix:
              'The owning generation runtime returned an invalid materialized service frontend resource',
          }),
        );
        if (
          adapted.modelName !== resource.modelName ||
          adapted.resource.modelName !== resource.modelName ||
          adapted.resource.version !== modelVersion
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-archive-materialization-adapter-identity-mismatch',
            message:
              'The owning generation runtime changed the model identity of a materialized service frontend resource',
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
            code: 'service-frontend-archive-materialization-encode-failed',
            prefix: `Failed to encode service frontend resource ${resource.modelName}@${modelVersion}`,
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
          code: 'service-frontend-archive-materialization-resource-missing',
          message: `Service frontend block ${block.frontendIndex} updated resource ${canonicalOrdinal} is missing`,
        });
      }
      const model = Object.values(frontend.controller.models).find(
        candidate => candidate.modelName === resource.modelName,
      );
      if (model === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-archive-materialization-model-missing',
          message: `Service frontend block ${block.frontendIndex} contains unknown model ${resource.modelName}`,
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
            kind: 'service',
            serviceName: props.key.serviceName,
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
            code: 'service-frontend-archive-materialization-adapter-result-invalid',
            prefix:
              'The owning generation runtime returned an invalid materialized service frontend resource',
          }),
        );
        if (
          adapted.modelName !== resource.modelName ||
          adapted.resource.modelName !== resource.modelName ||
          adapted.resource.version !== modelVersion
        ) {
          return yield* new ZerospinError({
            code: 'service-frontend-archive-materialization-adapter-identity-mismatch',
            message:
              'The owning generation runtime changed the model identity of a materialized service frontend resource',
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
            code: 'service-frontend-archive-materialization-encode-failed',
            prefix: `Failed to encode service frontend resource ${resource.modelName}@${modelVersion}`,
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
      'ServiceFrontendBlockRepo.storeServiceFrontendBlocks.transaction',
    )(function* ({ tx }) {
      const lineage = tx
        .select()
        .from(serviceFrontendBlockDrizzleSchemas.lineage)
        .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
        .get();
      if (
        lineage === undefined ||
        lineage.generationId !== generationId ||
        lineage.serviceName !== props.key.serviceName ||
        lineage.userId !== userId ||
        lineage.frontendName !== props.key.frontendName
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-lineage-target-mismatch',
          message:
            'ServiceFrontendBlockRepo stored lineage does not match its repository target',
        });
      }
      const terminalRow = tx
        .select({
          frontendIndex:
            serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
              .frontendIndex,
        })
        .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
        .orderBy(
          desc(
            serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
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
            serviceFrontendBlockDrizzleSchemas.serviceFrontendModelVersionCoverage,
          )
          .where(
            and(
              eq(
                serviceFrontendBlockDrizzleSchemas
                  .serviceFrontendModelVersionCoverage.modelName,
                modelVersion.modelName,
              ),
              eq(
                serviceFrontendBlockDrizzleSchemas
                  .serviceFrontendModelVersionCoverage.modelVersion,
                modelVersion.modelVersion,
              ),
            ),
          )
          .get();
        if (existingCoverage === undefined) {
          tx.insert(
            serviceFrontendBlockDrizzleSchemas.serviceFrontendModelVersionCoverage,
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
            code: 'service-frontend-archive-materialization-coverage-invalid',
            message: `Service frontend archive coverage for ${modelVersion.modelName}@${modelVersion.modelVersion} begins after its terminal index`,
          });
        }
      }
      const newlyInserted: IServiceFrontendBlock[] = [];
      for (const encoded of encodedBlocks) {
        const existing = tx
          .select({
            canonicalBytes:
              serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
                .canonicalBytes,
          })
          .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
          .where(
            eq(
              serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
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
            code: 'service-frontend-archive-conflicting-duplicate',
            message: `Service service frontend archive index ${encoded.frontendIndex} already exists with different canonical bytes`,
          });
        }
        if (encoded.frontendIndex !== terminalFrontendIndex + 1) {
          return yield* new ZerospinError({
            code: 'service-frontend-archive-index-gap',
            message: `Service service frontend archive expected index ${terminalFrontendIndex + 1}, received ${encoded.frontendIndex}`,
            extra: {
              terminalFrontendIndex,
              receivedFrontendIndex: encoded.frontendIndex,
            },
          });
        }
        tx.insert(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
          .values({
            frontendIndex: encoded.frontendIndex,
            canonicalBytes: encoded.canonicalBytes,
            serviceFrontendBlock: encoded.canonicalBytes,
          })
          .run();
        for (const materialization of encoded.materializations) {
          tx.insert(
            serviceFrontendBlockDrizzleSchemas.serviceFrontendResourceMaterializations,
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
