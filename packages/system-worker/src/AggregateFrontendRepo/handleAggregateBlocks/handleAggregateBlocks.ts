import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyAggregateFrontendMutationTx } from '@zerospin/core/contracts/applyAggregateFrontendMutationTx';
import { applyMutationInverseTx } from '@zerospin/core/contracts/applyMutationInverseTx';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedCommand,
  IFailedPushedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import {
  selectAllFromSelection,
  type ISelection,
} from '@zerospin/core/models/makeSelection';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import type {
  IAggregateCursor,
  IAnyDrizzleSchemas,
  IAnyShape,
  IAnyTables,
  IEncodedResourceShape,
  IModel,
  IModels,
  IRef,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendBlock } from '@zerospin/core/session/types';
import type { IGraph, IRefRecord } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { desc, eq, sql } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { getInsertedResources } from '../../deltas/getInsertedResources.js';
import {
  getLastAggregateCursor,
  getLastAggregateIndex,
  setLastAggregateCursor,
  setLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import type { IAggregateBlock } from '../../types.js';
import { aggregateFrontendRepoDrizzleSchemas } from '../AggregateFrontendRepo.js';
import { applyDeltas } from '../applyDeltas/applyDeltas.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { makeSelectionWhere } from '../makeSelectionWhere/makeSelectionWhere.js';
import { prepareAggregateFrontendCommand } from '../prepareAggregateFrontendCommand/prepareAggregateFrontendCommand.js';
import { projectAggregateFrontendResource } from '../projectAggregateFrontendResource/projectAggregateFrontendResource.js';

const ProjectedAggregateResourceSchema = Schema.Struct({
  modelName: Schema.String,
  resource: EncodedResourceSchema,
});

export const handleAggregateBlocks = Effect.fn(
  'AggregateFrontendRepo.handleAggregateBlocks',
)(function* (props: {
  blocks: readonly IAggregateBlock[];
  db: IDb;
  aggregateFrontendRepoSchema: IAnyDrizzleSchemas &
    Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async | CuidFactory> {
  const { blocks, db, aggregateFrontendRepoSchema, key, storage } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: key.aggregateName,
    recordKind: 'aggregates',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: key.frontendName,
    recordKind: `frontends owned by aggregate ${key.aggregateName}`,
  });
  const frontendController = frontendBinding.controller;
  const aggregateModels: IModels = aggregate.models;
  const frontendModels: IModels = frontendController.models;
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    key.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-aggregate-source-user-id-invalid',
      prefix: 'Failed to decode AggregateFrontendRepo aggregate source userId',
    }),
  );

  const aggregateSourceTables: IAnyTables = {};
  const aggregateSourceShapes: Record<string, IAnyShape> = {};
  for (const model of Object.values(aggregateModels)) {
    const sourceShape: IAnyShape = {};
    aggregateSourceShapes[model.modelName] = sourceShape;
    aggregateSourceTables[model.modelName] = {
      ...model.table,
      shape: sourceShape,
    };
  }
  for (const model of Object.values(aggregateModels)) {
    const sourceShape = aggregateSourceShapes[model.modelName];
    if (sourceShape === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-aggregate-source-shape-missing',
        message: `AggregateFrontendRepo source shape for aggregate model "${model.modelName}" is missing`,
      });
    }
    const modelShape: IAnyShape = model.table.shape;
    for (const [propertyName, descriptor] of Object.entries(modelShape)) {
      if (descriptor.kind !== PrimitiveKind.Ref) {
        sourceShape[propertyName] = descriptor;
        continue;
      }
      const targetModel = aggregateModels[descriptor.targetTableName];
      const targetSourceTable =
        aggregateSourceTables[descriptor.targetTableName];
      if (
        targetModel === undefined ||
        targetModel.table !== descriptor.table ||
        targetSourceTable === undefined
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-aggregate-source-ref-target-missing',
          message: `AggregateFrontendRepo source ref ${model.modelName}.${propertyName} targets an unregistered aggregate model table`,
          extra: {
            aggregateName: key.aggregateName,
            modelName: model.modelName,
            propertyName,
            targetTableName: descriptor.targetTableName,
          },
        });
      }
      sourceShape[propertyName] = {
        ...descriptor,
        table: targetSourceTable,
      };
    }
  }

  const aggregateSourceModels: IModels = {};
  for (const model of Object.values(aggregateModels)) {
    const sourceShape = aggregateSourceShapes[model.modelName];
    const sourceTable = aggregateSourceTables[model.modelName];
    const sourceDrizzleSchema =
      aggregateFrontendRepoSchema[`aggregateSource_${model.modelName}`];
    if (
      sourceShape === undefined ||
      sourceTable === undefined ||
      sourceDrizzleSchema === undefined
    ) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-aggregate-source-schema-missing',
        message: `AggregateFrontendRepo mapped source schema for aggregate model "${model.modelName}" is missing`,
      });
    }
    const sourceAttributes: IAnyShape = {};
    for (const attributeName of Object.keys(model.attributes)) {
      const descriptor = sourceShape[attributeName];
      if (descriptor === undefined) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-aggregate-source-attribute-missing',
          message: `AggregateFrontendRepo source attribute ${model.modelName}.${attributeName} is missing`,
        });
      }
      sourceAttributes[attributeName] = descriptor;
    }
    aggregateSourceModels[model.modelName] = {
      ...model,
      attributes: sourceAttributes,
      drizzleSchema: sourceDrizzleSchema,
      propertiesShape: sourceShape,
      table: sourceTable,
    };
  }

  const aggregateSourceSelections: Record<string, ISelection<IModel>> = {};
  for (const [modelName, selection] of Object.entries(aggregate.selections)) {
    const sourceModel = aggregateSourceModels[selection.model.modelName];
    if (sourceModel === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-aggregate-source-selection-model-missing',
        message: `AggregateFrontendRepo source selection "${modelName}" targets an unregistered aggregate model`,
      });
    }
    aggregateSourceSelections[modelName] = {
      ...selection,
      model: sourceModel,
    };
  }
  const telemetryCollector = makeTelemetryCollector();
  let hadOptimisticReplayFailure = false;
  const selectionWhereByModelName: Record<string, Record<string, unknown>> = {};
  if (blocks.length !== 0) {
    for (const modelName of Object.keys(aggregateSourceSelections)) {
      selectionWhereByModelName[modelName] = yield* makeSelectionWhere({
        aggregateName: key.aggregateName,
        userId,
        modelName,
      });
    }
  }

  yield* makeAsyncTx({
    storage,
    program: Effect.fn(
      'AggregateFrontendRepo.handleAggregateBlocks.transaction',
    )(function* () {
      let lastAggregateCursor: IAggregateCursor | null =
        yield* getLastAggregateCursor({
          storage,
          defaultValue: null,
        });
      let lastAggregateIndex: number | null = yield* getLastAggregateIndex({
        storage,
        defaultValue: null,
      });
      if ((lastAggregateCursor === null) !== (lastAggregateIndex === null)) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-repo-aggregate-watermark-incomplete',
          message:
            'AggregateFrontendRepo aggregate cursor and index must both be null or both be present',
        });
      }
      const currentFrontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
      if (
        currentFrontendIndex !== undefined &&
        typeof currentFrontendIndex !== 'number'
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-repo-invalid-aggregate-frontend-index',
          message: 'AggregateFrontendRepo frontendIndex must be a number',
        });
      }
      let frontendIndex = currentFrontendIndex ?? 0;
      const emissionMode = yield* Schema.decodeUnknown(
        Schema.Literal('live', 'no-emission'),
      )(storage.kv.get('emissionMode')).pipe(
        mapParseError({
          code: 'aggregate-frontend-repo-emission-mode-invalid',
          prefix: 'Failed to decode AggregateFrontendRepo emission mode',
        }),
      );
      const pushedCommands = new Map<string, IEncodedCommand<IPushedCommand>>();
      for (const command of db
        .select()
        .from(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
        .all()) {
        pushedCommands.set(command.id, command);
      }
      for (const block of [...blocks].sort(
        (a, b) => a.aggregateIndex - b.aggregateIndex,
      )) {
        if (lastAggregateIndex !== null) {
          if (
            block.aggregateIndex === lastAggregateIndex &&
            block.lastAggregateCursor !== lastAggregateCursor
          ) {
            return yield* new ZerospinError({
              code: 'aggregate-frontend-repo-aggregate-watermark-conflict',
              message:
                'AggregateFrontendRepo received a different aggregate cursor for its current aggregate index',
              extra: {
                aggregateIndex: lastAggregateIndex,
                expectedLastAggregateCursor: lastAggregateCursor,
                actualLastAggregateCursor: block.lastAggregateCursor,
              },
            });
          }
          if (block.aggregateIndex <= lastAggregateIndex) {
            continue;
          }
        }
        if (
          lastAggregateCursor !== null &&
          block.lastAggregateCursor === lastAggregateCursor
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-repo-aggregate-cursor-reused',
            message:
              'AggregateFrontendRepo received its current aggregate cursor at a different aggregate index',
          });
        }
        const aggregateDeltas = yield* makeTx({
          db,
          program: Effect.fn(
            'AggregateFrontendRepo.handleAggregateBlocks.applyAggregateSource',
          )(function* ({ tx }) {
            const graph: IGraph = {};
            for (const row of tx
              .select()
              .from(aggregateFrontendRepoDrizzleSchemas.aggregateSourceGraph)
              .all()) {
              const modelRefs = graph[row.modelName] ?? {};
              modelRefs[row.resourceId] = {
                id: row.resourceId,
                modelName: row.modelName,
              };
              graph[row.modelName] = modelRefs;
            }

            const originSelectedResourcesByModelName: Record<
              string,
              Record<string, IEncodedResourceShape>
            > = {};
            for (const [modelName, selection] of Object.entries(
              aggregateSourceSelections,
            )) {
              const where = selectionWhereByModelName[modelName];
              if (where === undefined) {
                return yield* new ZerospinError({
                  code: 'aggregate-frontend-aggregate-source-selection-where-missing',
                  message: `AggregateFrontendRepo has no prepared aggregate selection for ${key.aggregateName}.${modelName}`,
                });
              }
              const selectedRows = selectAllFromSelection({
                db: tx,
                models: aggregateSourceModels,
                selection,
                userId,
                where,
              }).all();
              const selectedResources: Record<string, IEncodedResourceShape> =
                {};
              for (const row of selectedRows) {
                const resource = yield* Schema.validate(EncodedResourceSchema)(
                  row,
                ).pipe(
                  mapParseError({
                    code: 'aggregate-frontend-aggregate-source-resource-invalid',
                    prefix: `Failed to decode selected aggregate source resource for ${key.aggregateName}.${modelName}`,
                  }),
                );
                selectedResources[resource.id] = resource;
              }
              originSelectedResourcesByModelName[modelName] = selectedResources;
            }

            for (const mutation of block.appliedMutations) {
              if (aggregateSourceSelections[mutation.modelName] === undefined) {
                continue;
              }
              yield* commitAppliedMutationTx({
                tx,
                models: aggregateSourceModels,
                mutation,
              });
            }

            const deltas: Record<
              string,
              {
                inserted: Record<string, IEncodedResourceShape>;
                updated: Record<string, IEncodedResourceShape>;
                deleted: Record<string, IEncodedResourceShape>;
              }
            > = {};
            for (const [modelName, selection] of Object.entries(
              aggregateSourceSelections,
            )) {
              const where = selectionWhereByModelName[modelName];
              if (where === undefined) {
                return yield* new ZerospinError({
                  code: 'aggregate-frontend-aggregate-source-selection-where-missing',
                  message: `AggregateFrontendRepo has no prepared aggregate selection for ${key.aggregateName}.${modelName}`,
                });
              }
              const selectedRows = selectAllFromSelection({
                db: tx,
                models: aggregateSourceModels,
                selection,
                userId,
                where,
              }).all();
              const destinationSelectedRefs: IRefRecord = {};
              const destinationSelectedResources: Record<
                string,
                IEncodedResourceShape
              > = {};
              for (const row of selectedRows) {
                const resource = yield* Schema.validate(EncodedResourceSchema)(
                  row,
                ).pipe(
                  mapParseError({
                    code: 'aggregate-frontend-aggregate-source-resource-invalid',
                    prefix: `Failed to decode selected aggregate source resource for ${key.aggregateName}.${modelName}`,
                  }),
                );
                destinationSelectedRefs[resource.id] = {
                  id: resource.id,
                  modelName: resource.modelName,
                };
                destinationSelectedResources[resource.id] = resource;
              }

              const originSelectedResources =
                originSelectedResourcesByModelName[modelName] ?? {};
              const originSelectedRefs: IRefRecord = {};
              for (const resource of Object.values(originSelectedResources)) {
                originSelectedRefs[resource.id] = {
                  id: resource.id,
                  modelName: resource.modelName,
                };
              }
              const inserted = getInsertedResources({
                originSelectedRefs,
                destinationSelectedResources,
              });
              const updated: Record<string, IEncodedResourceShape> = {};
              for (const mutation of block.appliedMutations) {
                if (
                  mutation.modelName !== selection.model.modelName ||
                  originSelectedResources[mutation.resourceId] === undefined
                ) {
                  continue;
                }
                const destinationResource =
                  destinationSelectedResources[mutation.resourceId];
                if (destinationResource !== undefined) {
                  updated[mutation.resourceId] = destinationResource;
                }
              }
              const deleted: Record<string, IEncodedResourceShape> = {};
              for (const [resourceId, resource] of Object.entries(
                originSelectedResources,
              )) {
                if (destinationSelectedResources[resourceId] === undefined) {
                  deleted[resourceId] = resource;
                }
              }
              deltas[modelName] = { inserted, updated, deleted };
              graph[modelName] = destinationSelectedRefs;
            }

            tx.delete(
              aggregateFrontendRepoDrizzleSchemas.aggregateSourceGraph,
            ).run();
            for (const modelRefs of Object.values(graph)) {
              for (const ref of Object.values(modelRefs)) {
                tx.insert(
                  aggregateFrontendRepoDrizzleSchemas.aggregateSourceGraph,
                )
                  .values({
                    resourceId: ref.id,
                    modelName: ref.modelName,
                  })
                  .run();
              }
            }
            return deltas;
          }),
        });

        const projectedDeltas: Record<
          string,
          {
            inserted: Record<string, IEncodedResourceShape>;
            updated: Record<string, IEncodedResourceShape>;
            deleted: Record<string, IEncodedResourceShape>;
          }
        > = {};
        for (const [aggregateModelName, aggregateDelta] of Object.entries(
          aggregateDeltas,
        )) {
          for (const resource of Object.values(aggregateDelta.inserted)) {
            if (
              Object.values(frontendBinding.models).some(
                model => model.modelName === aggregateModelName,
              )
            ) {
              const result = yield* projectAggregateFrontendResource({
                aggregateName: key.aggregateName,
                frontendName: key.frontendName,
                modelName: aggregateModelName,
                resource,
              });
              const projected = yield* Schema.decodeUnknown(
                ProjectedAggregateResourceSchema,
              )(result, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'system-runtime-aggregate-frontend-projection-result-invalid',
                  prefix: `Dynamic frontend projection for ${key.aggregateName}.${key.frontendName}.${aggregateModelName} returned an invalid result`,
                }),
              );
              if (projected.resource.modelName !== projected.modelName) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-mismatch',
                  message: `Projected resource modelName "${projected.resource.modelName}" does not match projection model "${projected.modelName}"`,
                });
              }
              if (frontendModels[projected.modelName] === undefined) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-not-found',
                  message: `Projected resource targets unknown frontend model "${projected.modelName}"`,
                });
              }
              const projectedDelta = projectedDeltas[
                projected.resource.modelName
              ] ?? {
                inserted: {},
                updated: {},
                deleted: {},
              };
              projectedDelta.inserted[projected.resource.id] =
                projected.resource;
              projectedDeltas[projected.resource.modelName] = projectedDelta;
            }
          }
          for (const resource of Object.values(aggregateDelta.updated)) {
            if (
              Object.values(frontendBinding.models).some(
                model => model.modelName === aggregateModelName,
              )
            ) {
              const result = yield* projectAggregateFrontendResource({
                aggregateName: key.aggregateName,
                frontendName: key.frontendName,
                modelName: aggregateModelName,
                resource,
              });
              const projected = yield* Schema.decodeUnknown(
                ProjectedAggregateResourceSchema,
              )(result, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'system-runtime-aggregate-frontend-projection-result-invalid',
                  prefix: `Dynamic frontend projection for ${key.aggregateName}.${key.frontendName}.${aggregateModelName} returned an invalid result`,
                }),
              );
              if (projected.resource.modelName !== projected.modelName) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-mismatch',
                  message: `Projected resource modelName "${projected.resource.modelName}" does not match projection model "${projected.modelName}"`,
                });
              }
              if (frontendModels[projected.modelName] === undefined) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-not-found',
                  message: `Projected resource targets unknown frontend model "${projected.modelName}"`,
                });
              }
              const projectedDelta = projectedDeltas[
                projected.resource.modelName
              ] ?? {
                inserted: {},
                updated: {},
                deleted: {},
              };
              projectedDelta.updated[projected.resource.id] =
                projected.resource;
              projectedDeltas[projected.resource.modelName] = projectedDelta;
            }
          }
          for (const resource of Object.values(aggregateDelta.deleted)) {
            if (
              Object.values(frontendBinding.models).some(
                model => model.modelName === aggregateModelName,
              )
            ) {
              const result = yield* projectAggregateFrontendResource({
                aggregateName: key.aggregateName,
                frontendName: key.frontendName,
                modelName: aggregateModelName,
                resource,
              });
              const projected = yield* Schema.decodeUnknown(
                ProjectedAggregateResourceSchema,
              )(result, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'system-runtime-aggregate-frontend-projection-result-invalid',
                  prefix: `Dynamic frontend projection for ${key.aggregateName}.${key.frontendName}.${aggregateModelName} returned an invalid result`,
                }),
              );
              if (projected.resource.modelName !== projected.modelName) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-mismatch',
                  message: `Projected resource modelName "${projected.resource.modelName}" does not match projection model "${projected.modelName}"`,
                });
              }
              if (frontendModels[projected.modelName] === undefined) {
                return yield* new ZerospinError({
                  code: 'system-runtime-aggregate-frontend-projection-model-not-found',
                  message: `Projected resource targets unknown frontend model "${projected.modelName}"`,
                });
              }
              const projectedDelta = projectedDeltas[
                projected.resource.modelName
              ] ?? {
                inserted: {},
                updated: {},
                deleted: {},
              };
              projectedDelta.deleted[projected.resource.id] =
                projected.resource;
              projectedDeltas[projected.resource.modelName] = projectedDelta;
            }
          }
        }
        const rebase = yield* makeTx({
          db,
          program: Effect.fn(
            'AggregateFrontendRepo.handleAggregateBlocks.applyAggregateBlock',
          )(function* ({ tx }) {
            tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
            const affectedRefs = new Map<
              string,
              { id: string; modelName: string }
            >();
            const aggregateInsertedIds = new Set<string>();
            for (const command of [...pushedCommands.values()].sort((a, b) =>
              b.pushedCursor.localeCompare(a.pushedCursor),
            )) {
              const mutations = tx
                .select()
                .from(aggregateFrontendRepoDrizzleSchemas.pushedMutations)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.pushedMutations
                      .commandId,
                    command.id,
                  ),
                )
                .orderBy(
                  desc(
                    aggregateFrontendRepoDrizzleSchemas.pushedMutations
                      .mutationIndex,
                  ),
                )
                .all();
              for (const mutation of mutations) {
                affectedRefs.set(
                  `${mutation.modelName}:${mutation.resourceId}`,
                  {
                    id: mutation.resourceId,
                    modelName: mutation.modelName,
                  },
                );
                const model = yield* getByKeyOrThrow({
                  record: frontendModels,
                  key: mutation.modelName,
                  recordKind: 'frontend models',
                });
                yield* decodeAppliedMutation({ mutation, model }).pipe(
                  Effect.flatMap(decodedMutation =>
                    applyMutationInverseTx({
                      tx,
                      mutation: decodedMutation,
                    }),
                  ),
                );
              }
            }
            tx.delete(
              aggregateFrontendRepoDrizzleSchemas.pushedMutations,
            ).run();

            yield* applyDeltas({
              tx,
              models: frontendModels,
              graphTable: aggregateFrontendRepoDrizzleSchemas.graph,
              deltas: projectedDeltas,
            });
            for (const [modelName, projectedDelta] of Object.entries(
              projectedDeltas,
            )) {
              for (const inserted of Object.values(projectedDelta.inserted)) {
                aggregateInsertedIds.add(inserted.id);
                affectedRefs.set(`${modelName}:${inserted.id}`, {
                  id: inserted.id,
                  modelName,
                });
              }
              for (const updated of Object.values(projectedDelta.updated)) {
                affectedRefs.set(`${modelName}:${updated.id}`, {
                  id: updated.id,
                  modelName,
                });
              }
              for (const deleted of Object.values(projectedDelta.deleted)) {
                affectedRefs.set(`${modelName}:${deleted.id}`, {
                  id: deleted.id,
                  modelName,
                });
              }
            }

            const executedPushedCommands: IAggregateFrontendBlock['executedPushedCommands'][number][] =
              [];
            const failedPushedCommands: IAggregateFrontendBlock['failedPushedCommands'][number][] =
              [];
            const terminalSessions = new Set<
              IAggregateFrontendBlock['pendingPushedCommands'][number]['sessionId']
            >();
            for (const command of block.executedCommands) {
              if (command.commandType !== 'frontend') {
                continue;
              }
              const pushed = pushedCommands.get(command.id);
              if (
                command.aggregateId !== key.aggregateId ||
                command.aggregateName !== key.aggregateName ||
                command.userId !== key.userId ||
                command.frontendName !== key.frontendName ||
                (emissionMode !== 'no-emission' && pushed === undefined)
              ) {
                continue;
              }
              tx.insert(
                aggregateFrontendRepoDrizzleSchemas.executedPushedCommands,
              )
                .values(command)
                .onConflictDoNothing()
                .run();
              executedPushedCommands.push(command);
            }
            for (const command of block.failedCommands) {
              if (command.commandType !== 'frontend') {
                continue;
              }
              if (!('pushedAt' in command)) {
                if (
                  command.aggregateId === key.aggregateId &&
                  command.aggregateName === key.aggregateName &&
                  command.userId === key.userId &&
                  command.frontendName === key.frontendName
                ) {
                  tx.insert(
                    aggregateFrontendRepoDrizzleSchemas.failedStagedCommands,
                  )
                    .values(command)
                    .onConflictDoUpdate({
                      target:
                        aggregateFrontendRepoDrizzleSchemas.failedStagedCommands
                          .id,
                      set: {
                        aggregateCursor: command.aggregateCursor,
                        aggregateIndex: command.aggregateIndex,
                      },
                    })
                    .run();
                }
                continue;
              }
              const pushed = pushedCommands.get(command.id);
              if (
                command.aggregateId !== key.aggregateId ||
                command.aggregateName !== key.aggregateName ||
                command.userId !== key.userId ||
                command.frontendName !== key.frontendName ||
                (emissionMode !== 'no-emission' && pushed === undefined)
              ) {
                continue;
              }
              tx.insert(
                aggregateFrontendRepoDrizzleSchemas.failedPushedCommands,
              )
                .values(command)
                .onConflictDoNothing()
                .run();
              failedPushedCommands.push(command);
            }
            for (const command of [
              ...executedPushedCommands,
              ...failedPushedCommands,
            ]) {
              terminalSessions.add(command.sessionId);
              const terminalStagedCursor = storage.kv.get(
                `terminalStagedCursor:${command.sessionId}`,
              );
              if (
                terminalStagedCursor !== undefined &&
                typeof terminalStagedCursor !== 'string'
              ) {
                return yield* new ZerospinError({
                  code: 'aggregate-frontend-rebase-invalid-terminal-staged-cursor',
                  message: `Terminal staged cursor for session "${command.sessionId}" must be a string`,
                });
              }
              if (
                terminalStagedCursor === undefined ||
                command.stagedCursor > terminalStagedCursor
              ) {
                storage.kv.put(
                  `terminalStagedCursor:${command.sessionId}`,
                  command.stagedCursor,
                );
              }
              tx.delete(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.pushedCommands.id,
                    command.id,
                  ),
                )
                .run();
              pushedCommands.delete(command.id);
            }

            const remainingCommands = [...pushedCommands.values()].sort(
              (left, right) =>
                left.pushedCursor.localeCompare(right.pushedCursor),
            );
            return {
              aggregateInsertedIds,
              affectedRefs,
              executedPushedCommands,
              failedPushedCommands,
              remainingCommands,
              terminalSessions,
            };
          }),
        });
        for (const pushedCommand of rebase.remainingCommands) {
          const replayed = yield* makeAsyncTx({
            storage,
            program: Effect.fn(
              'AggregateFrontendRepo.handleAggregateBlocks.replay',
            )(function* () {
              const prepared = yield* prepareAggregateFrontendCommand({
                db,
                command: pushedCommand,
              }).pipe(Effect.either);
              if (Either.isLeft(prepared)) {
                return Either.left(prepared.left);
              }
              const mutations = prepared.right.mutations;
              return yield* makeTx({
                db,
                program: Effect.fn(
                  'AggregateFrontendRepo.handleAggregateBlocks.applyReplay',
                )(function* ({ tx }) {
                  return yield* withSavepoint({
                    tx,
                    program: Effect.fn(
                      'AggregateFrontendRepo.handleAggregateBlocks.applyReplaySavepoint',
                    )(function* ({ tx: savepointTx }) {
                      for (const [
                        mutationIndex,
                        mutation,
                      ] of mutations.entries()) {
                        const appliedMutation =
                          yield* applyAggregateFrontendMutationTx({
                            tx: savepointTx,
                            mutation,
                            commandId: pushedCommand.id,
                            mutationIndex,
                            appliedAt: pushedCommand.pushedAt,
                          });
                        const encodedMutation = yield* encodeAppliedMutation({
                          mutation: appliedMutation,
                        });
                        rebase.affectedRefs.set(
                          `${encodedMutation.modelName}:${encodedMutation.resourceId}`,
                          {
                            id: encodedMutation.resourceId,
                            modelName: encodedMutation.modelName,
                          },
                        );
                        savepointTx
                          .insert(
                            aggregateFrontendRepoDrizzleSchemas.pushedMutations,
                          )
                          .values(encodedMutation)
                          .run();
                      }
                    }),
                  }).pipe(Effect.either);
                }),
              });
            }),
          });
          if (Either.isRight(replayed)) {
            continue;
          }

          rebase.terminalSessions.add(pushedCommand.sessionId);
          const failedPushedCommand = {
            ...pushedCommand,
            aggregateCursor: block.lastAggregateCursor,
            aggregateIndex: block.aggregateIndex,
            failedAt: yield* dutils.date(),
            failure: ZerospinError.stringify(replayed.left),
            status: 'failed',
          } satisfies IEncodedCommand<IFailedPushedCommand>;
          yield* makeTx({
            db,
            program: Effect.fn(
              'AggregateFrontendRepo.handleAggregateBlocks.terminalizeFailedReplay',
            )(function* ({ tx }) {
              tx.insert(
                aggregateFrontendRepoDrizzleSchemas.failedPushedCommands,
              )
                .values(failedPushedCommand)
                .run();
              tx.delete(aggregateFrontendRepoDrizzleSchemas.pushedCommands)
                .where(
                  eq(
                    aggregateFrontendRepoDrizzleSchemas.pushedCommands.id,
                    pushedCommand.id,
                  ),
                )
                .run();
            }),
          });
          pushedCommands.delete(pushedCommand.id);
          rebase.failedPushedCommands.push(failedPushedCommand);
          hadOptimisticReplayFailure = true;
          yield* Effect.logWarning(
            `AggregateFrontendRepo removed pushed command "${pushedCommand.id}" after optimistic replay failed: ${replayed.left.message}`,
          ).pipe(
            Effect.annotateLogs({
              commandId: pushedCommand.id,
              failure: replayed.left.message,
              frontendName: key.frontendName,
            }),
          );
        }

        yield* makeTx({
          db,
          program: Effect.fn(
            'AggregateFrontendRepo.handleAggregateBlocks.commitFrontendBlock',
          )(function* ({ tx }) {
            for (const sessionId of rebase.terminalSessions) {
              const processedStagedCursor = storage.kv.get(
                `processedStagedCursor:${sessionId}`,
              );
              if (
                processedStagedCursor !== undefined &&
                typeof processedStagedCursor !== 'string'
              ) {
                return yield* new ZerospinError({
                  code: 'aggregate-frontend-rebase-invalid-processed-staged-cursor',
                  message: `Processed staged cursor for session "${sessionId}" must be a string`,
                });
              }
              if (processedStagedCursor !== undefined) {
                storage.kv.put(
                  `terminalStagedCursor:${sessionId}`,
                  processedStagedCursor,
                );
              }
            }

            const inserted: IEncodedResourceShape[] = [];
            const updated: IEncodedResourceShape[] = [];
            const deleted: IRef[] = [];
            for (const affectedRef of rebase.affectedRefs.values()) {
              const model = frontendModels[affectedRef.modelName];
              if (model === undefined) {
                continue;
              }
              const row = tx
                .select()
                .from(model.drizzleSchema)
                .where(eq(model.drizzleSchema.id, affectedRef.id))
                .get();
              if (row === undefined) {
                deleted.push(affectedRef);
                continue;
              }
              const resource = yield* Schema.validate(EncodedResourceSchema)(
                row,
              ).pipe(
                mapParseError({
                  code: 'aggregate-frontend-convergence-resource-decode-failed',
                  prefix: `Failed to decode converged resource "${affectedRef.id}"`,
                }),
              );
              if (rebase.aggregateInsertedIds.has(resource.id)) {
                inserted.push(resource);
              } else {
                updated.push(resource);
              }
            }

            const delta = { inserted, updated, deleted };
            lastAggregateCursor = block.lastAggregateCursor;
            lastAggregateIndex = block.aggregateIndex;
            yield* setLastAggregateCursor({
              storage,
              tx,
              aggregateCursor: block.lastAggregateCursor,
            });
            yield* setLastAggregateIndex({
              storage,
              tx,
              aggregateIndex: block.aggregateIndex,
            });
            if (emissionMode === 'no-emission') {
              return;
            }
            frontendIndex += 1;
            storage.kv.put(FRONTEND_INDEX_KV_KEY, frontendIndex);
            const frontendBlock = {
              frontendName: key.frontendName,
              lastAggregateCursor: block.lastAggregateCursor,
              frontendIndex,
              delta,
              pendingPushedCommands: [...pushedCommands.values()].sort(
                (left, right) =>
                  left.pushedCursor.localeCompare(right.pushedCursor),
              ),
              executedPushedCommands: rebase.executedPushedCommands,
              failedPushedCommands: rebase.failedPushedCommands,
            } satisfies IAggregateFrontendBlock;
            const encodedFrontendBlock = yield* Schema.encode(
              Schema.parseJson(AggregateFrontendBlockSchema),
            )(frontendBlock).pipe(
              mapParseError({
                code: 'aggregate-frontend-block-encode-failed',
                prefix: 'Failed to encode aggregate-originated frontend block',
              }),
            );
            tx.insert(
              aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
            )
              .values({
                frontendIndex,
                block: encodedFrontendBlock,
                publishedAt: null,
                failure: null,
              })
              .onConflictDoNothing()
              .run();
          }),
        });
      }
    }),
  }).pipe(Effect.provide(makeTelemetryLayer(telemetryCollector)));

  if (!hadOptimisticReplayFailure) {
    return;
  }

  const batch = telemetryCollector.flush();
  yield* Effect.gen(function* () {
    const systemLogRepo = yield* getSystemLogRepo({
      key: { generationId: key.generationId },
    });
    const encoded = yield* makeAsync(() =>
      systemLogRepo.appendTelemetryBatch({
        batch,
      }),
    );
    yield* decodeRpc(encoded);
  }).pipe(Effect.catchAll(() => Effect.void));
});
