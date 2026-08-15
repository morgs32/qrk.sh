import type { Async } from '@zerospin/core/async/Async';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import type {
  IAnyDrizzleSchemas,
  IAnyShape,
  IAnyTables,
  IEncodedResourceShape,
  IModel,
  IModels,
  IRef,
} from '@zerospin/core/models/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { projectServiceFrontendResource } from '../projectServiceFrontendResource/projectServiceFrontendResource.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

/*
 * 1. Validate the direct service/frontend binding and its canonical protocol.
 * 2. Retain a private current service-model replica and exact source receipts.
 * 3. Project complete before/after resources through the owning Dynamic Runtime.
 * 4. Apply the projected current delta and advance every source watermark.
 * 5. Emit one canonical current frontend block for each relevant live block.
 */
export const handleServiceBlocks = Effect.fn(
  'ServiceFrontendRepo.handleServiceBlocks',
)(function* (props: {
  serviceName: string;
  blocks: readonly IServiceBlock[];
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
  serviceFrontendRepoSchema: IAnyDrizzleSchemas &
    Record<`serviceSource_${string}`, IModel['drizzleSchema']>;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { blocks, db, key, serviceFrontendRepoSchema, storage } = props;
  if (props.serviceName !== key.serviceName) {
    return yield* new ZerospinError({
      code: 'service-frontend-block-service-mismatch',
      message: `ServiceFrontendRepo belongs to service "${key.serviceName}", not "${props.serviceName}"`,
    });
  }

  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: key.serviceName,
    recordKind: 'services',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: service.frontends,
    key: key.frontendName,
    recordKind: `frontends owned by service ${key.serviceName}`,
  });
  const frontendModels: IModels = {};
  for (const model of Object.values(frontendBinding.controller.models)) {
    frontendModels[model.modelName] = model;
  }

  const serviceModels: IModels = service.models;
  const serviceSourceTables: IAnyTables = {};
  const serviceSourceShapes: Record<string, IAnyShape> = {};
  for (const model of Object.values(serviceModels)) {
    const sourceShape: IAnyShape = {};
    serviceSourceShapes[model.modelName] = sourceShape;
    serviceSourceTables[model.modelName] = {
      ...model.table,
      shape: sourceShape,
    };
  }
  for (const model of Object.values(serviceModels)) {
    const sourceShape = serviceSourceShapes[model.modelName];
    if (sourceShape === undefined) {
      return yield* new ZerospinError({
        code: 'service-frontend-source-shape-missing',
        message: `ServiceFrontendRepo source shape for service model "${model.modelName}" is missing`,
      });
    }
    const modelShape: IAnyShape = model.table.shape;
    for (const [propertyName, descriptor] of Object.entries(modelShape)) {
      if (descriptor.kind !== PrimitiveKind.Ref) {
        sourceShape[propertyName] = descriptor;
        continue;
      }
      const targetModel = serviceModels[descriptor.targetTableName];
      const targetSourceTable = serviceSourceTables[descriptor.targetTableName];
      if (
        targetModel === undefined ||
        targetModel.table !== descriptor.table ||
        targetSourceTable === undefined
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-source-ref-target-missing',
          message: `ServiceFrontendRepo source ref ${model.modelName}.${propertyName} targets an unregistered service model table`,
        });
      }
      sourceShape[propertyName] = {
        ...descriptor,
        table: targetSourceTable,
      };
    }
  }

  const serviceSourceModels: IModels = {};
  for (const model of Object.values(serviceModels)) {
    const sourceShape = serviceSourceShapes[model.modelName];
    const sourceTable = serviceSourceTables[model.modelName];
    const sourceDrizzleSchema =
      serviceFrontendRepoSchema[`serviceSource_${model.modelName}`];
    if (
      sourceShape === undefined ||
      sourceTable === undefined ||
      sourceDrizzleSchema === undefined
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-source-schema-missing',
        message: `ServiceFrontendRepo mapped source schema for service model "${model.modelName}" is missing`,
      });
    }
    const sourceAttributes: IAnyShape = {};
    for (const attributeName of Object.keys(model.attributes)) {
      const descriptor = sourceShape[attributeName];
      if (descriptor === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-source-attribute-missing',
          message: `ServiceFrontendRepo source attribute ${model.modelName}.${attributeName} is missing`,
        });
      }
      sourceAttributes[attributeName] = descriptor;
    }
    serviceSourceModels[model.modelName] = {
      ...model,
      attributes: sourceAttributes,
      drizzleSchema: sourceDrizzleSchema,
      propertiesShape: sourceShape,
      table: sourceTable,
    };
  }

  const state = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.projectionState)
    .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
    .get();
  if (
    state === undefined ||
    state.generationId !== key.generationId ||
    state.serviceName !== key.serviceName ||
    state.userId !== key.userId ||
    state.frontendName !== key.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-projection-state-required',
      message:
        'ServiceFrontendRepo must install the exact projection state before receiving service blocks',
    });
  }
  const boundSourceModelNames = new Set(
    Object.values(frontendBinding.models).map(model => model.modelName),
  );

  const canonicalBlocks: Array<{
    block: IServiceBlock;
    canonicalBytes: string;
  }> = [];
  for (const block of blocks) {
    if (!Number.isInteger(block.serviceIndex) || block.serviceIndex < 1) {
      return yield* new ZerospinError({
        code: 'service-frontend-source-index-invalid',
        message: `Service frontend source index must be a positive integer, received ${block.serviceIndex}`,
      });
    }
    canonicalBlocks.push({
      block,
      canonicalBytes: yield* Schema.encode(
        Schema.parseJson(ServiceBlockSchema),
      )(block).pipe(
        mapParseError({
          code: 'service-frontend-source-block-encode-failed',
          prefix: `Failed to encode service frontend source block ${block.serviceIndex}`,
        }),
      ),
    });
  }

  yield* makeAsyncTx({
    storage,
    program: Effect.fn('ServiceFrontendRepo.handleServiceBlocks.transaction')(
      function* () {
        for (const encoded of canonicalBlocks) {
          const appliedSource = yield* makeTx({
            db,
            program: Effect.fn(
              'ServiceFrontendRepo.handleServiceBlocks.applySource',
            )(function* ({ tx }) {
              const currentState = tx
                .select()
                .from(serviceFrontendRepoDrizzleSchemas.projectionState)
                .where(
                  eq(
                    serviceFrontendRepoDrizzleSchemas.projectionState.id,
                    'state',
                  ),
                )
                .get();
              if (currentState === undefined) {
                return yield* new ZerospinError({
                  code: 'service-frontend-projection-state-required',
                  message:
                    'ServiceFrontendRepo projection state disappeared during source delivery',
                });
              }
              const expectedServiceIndex = (currentState.serviceIndex ?? 0) + 1;
              if (encoded.block.serviceIndex < expectedServiceIndex) {
                const receipt = tx
                  .select()
                  .from(serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts)
                  .where(
                    eq(
                      serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts
                        .serviceIndex,
                      encoded.block.serviceIndex,
                    ),
                  )
                  .get();
                if (
                  receipt !== undefined &&
                  receipt.lastServiceCursor ===
                    encoded.block.lastServiceCursor &&
                  receipt.canonicalBytes === encoded.canonicalBytes
                ) {
                  return { duplicate: true, currentState, affected: [] };
                }
                return yield* new ZerospinError({
                  code: 'service-frontend-source-conflicting-duplicate',
                  message: `Service frontend source index ${encoded.block.serviceIndex} is stale without identical retained bytes`,
                });
              }
              if (encoded.block.serviceIndex !== expectedServiceIndex) {
                return yield* new ZerospinError({
                  code: 'service-frontend-source-index-gap',
                  message: `Service frontend source expected index ${expectedServiceIndex}, received ${encoded.block.serviceIndex}`,
                });
              }

              const affected = new Map<
                string,
                {
                  modelName: string;
                  resourceId: string;
                  before: unknown | null;
                  after: unknown | null;
                }
              >();
              for (const mutation of encoded.block.appliedMutations) {
                const sourceModel = serviceSourceModels[mutation.modelName];
                if (sourceModel === undefined) {
                  return yield* new ZerospinError({
                    code: 'service-frontend-source-model-not-found',
                    message: `Service block mutation targets unknown source model "${mutation.modelName}"`,
                  });
                }
                if (boundSourceModelNames.has(mutation.modelName)) {
                  const affectedKey = `${mutation.modelName}:${mutation.resourceId}`;
                  if (!affected.has(affectedKey)) {
                    const beforeRow = tx
                      .select()
                      .from(sourceModel.drizzleSchema)
                      .where(
                        eq(sourceModel.drizzleSchema.id, mutation.resourceId),
                      )
                      .get();
                    affected.set(affectedKey, {
                      modelName: mutation.modelName,
                      resourceId: mutation.resourceId,
                      before: beforeRow ?? null,
                      after: null,
                    });
                  }
                }
                yield* commitAppliedMutationTx({
                  tx,
                  models: serviceSourceModels,
                  mutation,
                });
              }
              for (const entry of affected.values()) {
                const sourceModel = serviceSourceModels[entry.modelName];
                if (sourceModel === undefined) {
                  return yield* new ZerospinError({
                    code: 'service-frontend-source-model-not-found',
                    message: `Affected service source model "${entry.modelName}" disappeared`,
                  });
                }
                const afterRow = tx
                  .select()
                  .from(sourceModel.drizzleSchema)
                  .where(eq(sourceModel.drizzleSchema.id, entry.resourceId))
                  .get();
                entry.after = afterRow ?? null;
              }
              return {
                duplicate: false,
                currentState,
                affected: [...affected.values()],
              };
            }),
          });
          if (appliedSource.duplicate) {
            continue;
          }

          const projectedChanges: Array<{
            before: IEncodedResourceShape | null;
            after: IEncodedResourceShape | null;
          }> = [];
          for (const affected of appliedSource.affected) {
            let projectedBefore: IEncodedResourceShape | null = null;
            if (affected.before !== null) {
              const projectedBeforeResult =
                yield* projectServiceFrontendResource({
                  serviceName: key.serviceName,
                  frontendName: key.frontendName,
                  modelName: affected.modelName,
                  resource: affected.before,
                });
              const decodedBefore = yield* Schema.decodeUnknown(
                Schema.Struct({
                  modelName: Schema.String,
                  resource: EncodedResourceSchema,
                }),
              )(projectedBeforeResult, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'service-frontend-projection-result-invalid',
                  prefix: `Dynamic projection returned an invalid prior resource for ${affected.modelName}.${affected.resourceId}`,
                }),
              );
              if (
                decodedBefore.modelName !== decodedBefore.resource.modelName ||
                frontendModels[decodedBefore.modelName] === undefined
              ) {
                return yield* new ZerospinError({
                  code: 'service-frontend-projection-model-mismatch',
                  message:
                    'Dynamic projection returned an undeclared prior frontend model identity',
                });
              }
              projectedBefore = decodedBefore.resource;
            }

            let projectedAfter: IEncodedResourceShape | null = null;
            if (affected.after !== null) {
              const projectedAfterResult =
                yield* projectServiceFrontendResource({
                  serviceName: key.serviceName,
                  frontendName: key.frontendName,
                  modelName: affected.modelName,
                  resource: affected.after,
                });
              const decodedAfter = yield* Schema.decodeUnknown(
                Schema.Struct({
                  modelName: Schema.String,
                  resource: EncodedResourceSchema,
                }),
              )(projectedAfterResult, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'service-frontend-projection-result-invalid',
                  prefix: `Dynamic projection returned an invalid current resource for ${affected.modelName}.${affected.resourceId}`,
                }),
              );
              if (
                decodedAfter.modelName !== decodedAfter.resource.modelName ||
                frontendModels[decodedAfter.modelName] === undefined
              ) {
                return yield* new ZerospinError({
                  code: 'service-frontend-projection-model-mismatch',
                  message:
                    'Dynamic projection returned an undeclared current frontend model identity',
                });
              }
              projectedAfter = decodedAfter.resource;
            }
            projectedChanges.push({
              before: projectedBefore,
              after: projectedAfter,
            });
          }

          yield* makeTx({
            db,
            program: Effect.fn(
              'ServiceFrontendRepo.handleServiceBlocks.commitProjection',
            )(function* ({ tx }) {
              tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
              const inserted: IEncodedResourceShape[] = [];
              const updated: IEncodedResourceShape[] = [];
              const deleted: IRef[] = [];
              for (const change of projectedChanges) {
                const identityChanged =
                  change.before !== null &&
                  change.after !== null &&
                  (change.before.id !== change.after.id ||
                    change.before.modelName !== change.after.modelName);
                if (
                  change.before !== null &&
                  (change.after === null || identityChanged)
                ) {
                  const beforeModel = frontendModels[change.before.modelName];
                  if (beforeModel === undefined) {
                    return yield* new ZerospinError({
                      code: 'service-frontend-projection-model-not-found',
                      message: `Prior projection targets unknown frontend model "${change.before.modelName}"`,
                    });
                  }
                  tx.delete(beforeModel.drizzleSchema)
                    .where(eq(beforeModel.drizzleSchema.id, change.before.id))
                    .run();
                  deleted.push({
                    id: change.before.id,
                    modelName: change.before.modelName,
                  });
                }
                if (change.after !== null) {
                  const afterModel = frontendModels[change.after.modelName];
                  if (afterModel === undefined) {
                    return yield* new ZerospinError({
                      code: 'service-frontend-projection-model-not-found',
                      message: `Current projection targets unknown frontend model "${change.after.modelName}"`,
                    });
                  }
                  const existedBefore =
                    !identityChanged &&
                    tx
                      .select({ id: afterModel.drizzleSchema.id })
                      .from(afterModel.drizzleSchema)
                      .where(eq(afterModel.drizzleSchema.id, change.after.id))
                      .get() !== undefined;
                  upsertHelper({
                    table: afterModel.drizzleSchema,
                    tx,
                    values: change.after,
                  });
                  if (existedBefore) {
                    updated.push(change.after);
                  } else {
                    inserted.push(change.after);
                  }
                }
              }

              const currentState = tx
                .select()
                .from(serviceFrontendRepoDrizzleSchemas.projectionState)
                .where(
                  eq(
                    serviceFrontendRepoDrizzleSchemas.projectionState.id,
                    'state',
                  ),
                )
                .get();
              if (
                currentState === undefined ||
                currentState.serviceIndex !==
                  appliedSource.currentState.serviceIndex ||
                currentState.frontendIndex !==
                  appliedSource.currentState.frontendIndex
              ) {
                return yield* new ZerospinError({
                  code: 'service-frontend-projection-state-changed',
                  message:
                    'ServiceFrontendRepo projection state changed during one atomic source delivery',
                });
              }
              tx.update(serviceFrontendRepoDrizzleSchemas.projectionState)
                .set({
                  lastServiceCursor: encoded.block.lastServiceCursor,
                  serviceIndex: encoded.block.serviceIndex,
                })
                .where(
                  eq(
                    serviceFrontendRepoDrizzleSchemas.projectionState.id,
                    'state',
                  ),
                )
                .run();
              tx.insert(serviceFrontendRepoDrizzleSchemas.serviceBlockReceipts)
                .values({
                  lastServiceCursor: encoded.block.lastServiceCursor,
                  serviceIndex: encoded.block.serviceIndex,
                  canonicalBytes: encoded.canonicalBytes,
                  block: encoded.canonicalBytes,
                })
                .run();

              if (
                currentState.emissionMode === 'no-emission' ||
                (inserted.length === 0 &&
                  updated.length === 0 &&
                  deleted.length === 0)
              ) {
                return;
              }
              const frontendIndex = currentState.frontendIndex + 1;
              const frontendBlock = {
                serviceName: key.serviceName,
                userId: currentState.userId,
                frontendName: key.frontendName,
                frontendIndex,
                lastServiceCursor: encoded.block.lastServiceCursor,
                delta: { inserted, updated, deleted },
              } satisfies IServiceFrontendBlock;
              const encodedFrontendBlock = yield* Schema.encode(
                Schema.parseJson(ServiceFrontendBlockSchema),
              )(frontendBlock).pipe(
                mapParseError({
                  code: 'service-frontend-block-encode-failed',
                  prefix: `Failed to encode service frontend block ${frontendIndex}`,
                }),
              );
              tx.update(serviceFrontendRepoDrizzleSchemas.projectionState)
                .set({ frontendIndex })
                .where(
                  eq(
                    serviceFrontendRepoDrizzleSchemas.projectionState.id,
                    'state',
                  ),
                )
                .run();
              tx.insert(
                serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox,
              )
                .values({
                  frontendIndex,
                  block: encodedFrontendBlock,
                  publishedAt: null,
                  failure: null,
                })
                .run();
            }),
          });
        }
      },
    ),
  });
});
