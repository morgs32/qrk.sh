import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyAggregateFrontendMutationTx } from '@zerospin/core/contracts/applyAggregateFrontendMutationTx';
import { applyMutationInverseTx } from '@zerospin/core/contracts/applyMutationInverseTx';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import {
  selectAllFromSelection,
  type ISelection,
} from '@zerospin/core/models/makeSelection';
import type {
  IEncodedResourceShape,
  IModel,
  IModels,
  IRef,
} from '@zerospin/core/models/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  PrimitiveKind,
  type IAnyShape,
  type IAnyTables,
} from '@zerospin/schema';
import { desc, eq, or, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { AggregateCommandChain } from '../../AggregateCommandChain/AggregateCommandChain.js';
import { makeSelectionWhere } from '../makeSelectionWhere/makeSelectionWhere.js';
import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';
import { projectAggregateFrontendResource } from '../projectAggregateFrontendResource/projectAggregateFrontendResource.js';

export const catchup = Effect.fn('MaterializedAggregateFrontendRepo.catchup')(
  function* (props: {
    aggregateCommandChains: Readonly<{
      getByName(name: string): Pick<AggregateCommandChain, 'getCommands'>;
    }>;
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    schema: Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
    throughAggregateIndex: number | undefined;
  }) {
    const { db, key } = props;
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
    const aggregateModels: IModels = aggregate.models;
    const frontendModels: IModels = frontendBinding.controller.models;

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
          code: 'materialized-aggregate-frontend-source-shape-missing',
          message: `Aggregate source shape for model ${model.modelName} is missing`,
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
        const targetSourceModel =
          targetModel !== undefined && 'sourceModel' in targetModel
            ? Reflect.get(targetModel, 'sourceModel')
            : undefined;
        const targetModelSourceTable =
          typeof targetSourceModel === 'object' && targetSourceModel !== null
            ? Reflect.get(targetSourceModel, 'table')
            : undefined;
        if (
          targetModel === undefined ||
          (targetModel.table !== descriptor.table &&
            targetModelSourceTable !== descriptor.table) ||
          targetSourceTable === undefined
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-source-ref-target-missing',
            message: `Aggregate source ref ${model.modelName}.${propertyName} targets an unregistered model`,
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
        props.schema[`aggregateSource_${model.modelName}`];
      if (
        sourceShape === undefined ||
        sourceTable === undefined ||
        sourceDrizzleSchema === undefined
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-frontend-source-schema-missing',
          message: `Mapped aggregate source schema for model ${model.modelName} is missing`,
        });
      }
      const sourceAttributes: IAnyShape = {};
      for (const attributeName of Object.keys(model.attributes)) {
        const descriptor = sourceShape[attributeName];
        if (descriptor === undefined) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-source-attribute-missing',
            message: `Aggregate source attribute ${model.modelName}.${attributeName} is missing`,
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
    const selectionWhereByModelName: Record<
      string,
      Record<string, unknown>
    > = {};
    for (const [modelName, selection] of Object.entries(aggregate.selections)) {
      const sourceModel = aggregateSourceModels[selection.model.modelName];
      if (sourceModel === undefined) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-frontend-source-selection-model-missing',
          message: `Aggregate source selection ${modelName} targets an unregistered model`,
        });
      }
      aggregateSourceSelections[modelName] = {
        ...selection,
        model: sourceModel,
      };
      selectionWhereByModelName[modelName] = yield* makeSelectionWhere({
        aggregateName: key.aggregateName,
        userId: key.userId,
        modelName,
      });
    }

    const aggregateCommandChainName =
      yield* AggregateCommandChain.fixedDORepoConfig.nameUtils.makeName({
        systemId: key.systemId,
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
      });
    const chain = props.aggregateCommandChains.getByName(
      aggregateCommandChainName,
    );
    let currentAggregateIndex =
      db
        .select()
        .from(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
        .where(
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas.projectionState.id,
            1,
          ),
        )
        .get()?.aggregateIndex ?? 0;

    while (
      props.throughAggregateIndex === undefined ||
      currentAggregateIndex < props.throughAggregateIndex
    ) {
      const page = yield* makeAsync<
        IEncodedResult<
          Readonly<{
            commands: readonly Schema.Schema.Type<
              typeof AggregateChainedCommandSchema
            >[];
            tip: number | null;
          }>,
          IAnyErrorJson
        >,
        IAnyError
      >(
        () =>
          chain.getCommands({
            afterAggregateIndex:
              currentAggregateIndex === 0 ? null : currentAggregateIndex,
          }),
        ZerospinError.catch({
          code: 'materialized-aggregate-frontend-catchup-rpc-failed',
          message: 'Failed to pull AggregateCommandChain history',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const observedTip = page.tip ?? 0;
      if (
        !Number.isSafeInteger(observedTip) ||
        observedTip < currentAggregateIndex ||
        page.commands.some(command => command.aggregateIndex > observedTip)
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-frontend-catchup-tip-invalid',
          message: `Aggregate history returned invalid terminal tip ${observedTip}`,
        });
      }
      if (page.commands.length === 0) {
        if (
          currentAggregateIndex < observedTip ||
          (props.throughAggregateIndex !== undefined &&
            currentAggregateIndex < props.throughAggregateIndex)
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-catchup-history-incomplete',
            message: `Aggregate history ended before aggregateIndex ${props.throughAggregateIndex}`,
          });
        }
        return;
      }

      for (const command of page.commands) {
        if (
          props.throughAggregateIndex !== undefined &&
          command.aggregateIndex > props.throughAggregateIndex
        ) {
          break;
        }
        const expectedAggregateIndex = currentAggregateIndex + 1;
        if (command.aggregateIndex !== expectedAggregateIndex) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-catchup-index-gap',
            message: `Expected aggregateIndex ${expectedAggregateIndex}, received ${command.aggregateIndex}`,
          });
        }
        if (command.delta === null) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-catchup-pending-command',
            message: `Aggregate history returned pending aggregateIndex ${command.aggregateIndex}`,
          });
        }
        const sourceDelta = command.delta;
        const canonicalBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(AggregateChainedCommandSchema),
        )(command).pipe(
          mapParseError({
            code: 'materialized-aggregate-frontend-source-command-encode-failed',
            prefix: `Failed to encode aggregate source ${command.aggregateIndex}`,
          }),
        );

        const existing = db
          .select()
          .from(materializedAggregateFrontendRepoDrizzleSchemas.executionClaims)
          .where(
            or(
              eq(
                materializedAggregateFrontendRepoDrizzleSchemas.executionClaims
                  .aggregateIndex,
                command.aggregateIndex,
              ),
              eq(
                materializedAggregateFrontendRepoDrizzleSchemas.executionClaims
                  .commandId,
                command.id,
              ),
            ),
          )
          .get();
        if (existing !== undefined) {
          if (
            existing.aggregateIndex !== command.aggregateIndex ||
            existing.commandId !== command.id ||
            existing.canonicalBytes !== canonicalBytes
          ) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-frontend-source-command-conflict',
              message: `Aggregate source ${command.aggregateIndex} differs from retained bytes`,
            });
          }
          if (existing.completedAt === null) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-frontend-execution-in-doubt',
              message: `Aggregate frontend execution ${command.aggregateIndex} was claimed without a retained result`,
            });
          }
          if (existing.result !== null) {
            yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
            )(existing.result).pipe(
              mapParseError({
                code: 'materialized-aggregate-frontend-result-invalid',
                prefix: `Failed to decode retained aggregate frontend result ${command.aggregateIndex}`,
              }),
            );
          }
          currentAggregateIndex = command.aggregateIndex;
          continue;
        }

        const claimState = db
          .select()
          .from(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
          .where(
            eq(
              materializedAggregateFrontendRepoDrizzleSchemas.projectionState
                .id,
              1,
            ),
          )
          .get();
        if (claimState === undefined) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-state-missing',
            message: 'Projection state must exist before catch-up',
          });
        }
        if (
          claimState.systemId !== key.systemId ||
          claimState.aggregateId !== key.aggregateId ||
          claimState.aggregateName !== key.aggregateName ||
          claimState.userId !== key.userId ||
          claimState.frontendName !== key.frontendName
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-state-target-mismatch',
            message: 'Persisted projection state belongs to another target',
          });
        }
        if (claimState.aggregateIndex !== currentAggregateIndex) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-frontier-conflict',
            message: `Aggregate frontier changed before ${command.aggregateIndex}`,
          });
        }
        db.insert(
          materializedAggregateFrontendRepoDrizzleSchemas.executionClaims,
        )
          .values({
            aggregateIndex: command.aggregateIndex,
            commandId: command.id,
            canonicalBytes,
            command: canonicalBytes,
            claimedAt: new Date(),
            completedAt: null,
            result: null,
          })
          .run();

        yield* makeTx({
          db,
          program: Effect.fn(
            'MaterializedAggregateFrontendRepo.catchup.transaction',
          )(function* ({ tx }) {
            yield* Effect.sync(() => {
              tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
            });
            const state = tx
              .select()
              .from(
                materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
              )
              .where(
                eq(
                  materializedAggregateFrontendRepoDrizzleSchemas
                    .projectionState.id,
                  1,
                ),
              )
              .get();
            if (state === undefined) {
              return yield* new ZerospinError({
                code: 'materialized-aggregate-frontend-state-missing',
                message: 'Projection state must exist before catch-up',
              });
            }
            if (
              state.systemId !== key.systemId ||
              state.aggregateId !== key.aggregateId ||
              state.aggregateName !== key.aggregateName ||
              state.userId !== key.userId ||
              state.frontendName !== key.frontendName
            ) {
              return yield* new ZerospinError({
                code: 'materialized-aggregate-frontend-state-target-mismatch',
                message: 'Persisted projection state belongs to another target',
              });
            }
            if (state.aggregateIndex !== currentAggregateIndex) {
              return yield* new ZerospinError({
                code: 'materialized-aggregate-frontend-frontier-conflict',
                message: `Aggregate frontier changed before ${command.aggregateIndex}`,
              });
            }
            const retained = tx
              .select()
              .from(
                materializedAggregateFrontendRepoDrizzleSchemas.executionClaims,
              )
              .where(
                or(
                  eq(
                    materializedAggregateFrontendRepoDrizzleSchemas
                      .executionClaims.aggregateIndex,
                    command.aggregateIndex,
                  ),
                  eq(
                    materializedAggregateFrontendRepoDrizzleSchemas
                      .executionClaims.commandId,
                    command.id,
                  ),
                ),
              )
              .get();
            if (
              retained === undefined ||
              retained.aggregateIndex !== command.aggregateIndex ||
              retained.commandId !== command.id ||
              retained.canonicalBytes !== canonicalBytes ||
              retained.completedAt !== null ||
              retained.result !== null
            ) {
              return yield* new ZerospinError({
                code: 'materialized-aggregate-frontend-claim-conflict',
                message: `Execution claim ${command.aggregateIndex} changed before commit`,
              });
            }

            const activeRows = tx
              .select()
              .from(
                materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism,
              )
              .orderBy(
                desc(
                  materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism
                    .pushIndex,
                ),
              )
              .all();
            for (const active of activeRows) {
              const inverses = yield* Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Array(EncodedAppliedMutationSchema),
                ),
              )(active.currentInverses).pipe(
                mapParseError({
                  code: 'materialized-aggregate-frontend-current-inverses-invalid',
                  prefix: `Failed to decode current inverses for pushIndex ${active.pushIndex}`,
                }),
              );
              for (const inverse of [...inverses].reverse()) {
                const model = yield* getByKeyOrThrow({
                  record: frontendModels,
                  key: inverse.modelName,
                  recordKind: 'frontend models',
                });
                const decoded = yield* decodeAppliedMutation({
                  mutation: inverse,
                  model,
                });
                yield* applyMutationInverseTx({ tx, mutation: decoded });
              }
            }

            const beforeByModelName: Record<
              string,
              Record<string, IEncodedResourceShape>
            > = {};
            for (const [modelName, selection] of Object.entries(
              aggregateSourceSelections,
            )) {
              const where = selectionWhereByModelName[modelName];
              if (where === undefined) {
                return yield* new ZerospinError({
                  code: 'materialized-aggregate-frontend-selection-where-missing',
                  message: `Selection predicate for ${modelName} is missing`,
                });
              }
              const resources: Record<string, IEncodedResourceShape> = {};
              for (const row of selectAllFromSelection({
                db: tx,
                models: aggregateSourceModels,
                selection,
                userId: key.userId,
                where,
              }).all()) {
                const resource = yield* Schema.decodeEffect(
                  Schema.toType(EncodedResourceSchema),
                )(row).pipe(
                  mapParseError({
                    code: 'materialized-aggregate-frontend-source-resource-invalid',
                    prefix: `Failed to decode selected source resource ${modelName}`,
                  }),
                );
                resources[resource.id] = resource;
              }
              beforeByModelName[modelName] = resources;
            }

            for (const resource of [
              ...sourceDelta.inserted,
              ...sourceDelta.updated,
            ]) {
              const model = yield* getByKeyOrThrow({
                record: aggregateSourceModels,
                key: resource.modelName,
                recordKind: 'aggregate source models',
              });
              upsertHelper({
                table: model.drizzleSchema,
                tx,
                values: resource,
              });
            }
            for (const resource of sourceDelta.deleted) {
              const model = yield* getByKeyOrThrow({
                record: aggregateSourceModels,
                key: resource.modelName,
                recordKind: 'aggregate source models',
              });
              if ('sourceModel' in model) {
                upsertHelper({
                  table: model.drizzleSchema,
                  tx,
                  values: resource,
                });
              } else {
                tx.delete(model.drizzleSchema)
                  .where(eq(model.drizzleSchema.id, resource.id))
                  .run();
              }
            }

            const afterByModelName: Record<
              string,
              Record<string, IEncodedResourceShape>
            > = {};
            for (const [modelName, selection] of Object.entries(
              aggregateSourceSelections,
            )) {
              const where = selectionWhereByModelName[modelName];
              if (where === undefined) {
                return yield* new ZerospinError({
                  code: 'materialized-aggregate-frontend-selection-where-missing',
                  message: `Selection predicate for ${modelName} is missing`,
                });
              }
              const after: Record<string, IEncodedResourceShape> = {};
              for (const row of selectAllFromSelection({
                db: tx,
                models: aggregateSourceModels,
                selection,
                userId: key.userId,
                where,
              }).all()) {
                const resource = yield* Schema.decodeEffect(
                  Schema.toType(EncodedResourceSchema),
                )(row).pipe(
                  mapParseError({
                    code: 'materialized-aggregate-frontend-source-resource-invalid',
                    prefix: `Failed to decode selected source resource ${modelName}`,
                  }),
                );
                after[resource.id] = resource;
              }
              afterByModelName[modelName] = after;
            }

            const projection = yield* Effect.gen(function* () {
              const inserted = new Map<string, IEncodedResourceShape>();
              const updated = new Map<string, IEncodedResourceShape>();
              const deleted = new Map<string, IRef>();
              for (const [modelName, selection] of Object.entries(
                aggregateSourceSelections,
              )) {
                const before = beforeByModelName[modelName] ?? {};
                const after = afterByModelName[modelName] ?? {};
                for (const resource of Object.values(after)) {
                  const previous = before[resource.id];
                  if (
                    previous !== undefined &&
                    JSON.stringify(previous) === JSON.stringify(resource)
                  ) {
                    continue;
                  }
                  const projected = yield* projectAggregateFrontendResource({
                    aggregateName: key.aggregateName,
                    frontendName: key.frontendName,
                    modelName: selection.model.modelName,
                    resource,
                  });
                  const decoded = yield* Schema.decodeUnknownEffect(
                    Schema.Struct({
                      modelName: Schema.String,
                      resource: EncodedResourceSchema,
                    }),
                  )(projected, { onExcessProperty: 'error' }).pipe(
                    mapParseError({
                      code: 'materialized-aggregate-frontend-projection-invalid',
                      prefix: `Projection for ${modelName}.${resource.id} returned invalid output`,
                    }),
                  );
                  const resourceKey = `${decoded.modelName}\u0000${decoded.resource.id}`;
                  if (previous === undefined) {
                    inserted.set(resourceKey, decoded.resource);
                    updated.delete(resourceKey);
                  } else if (!inserted.has(resourceKey)) {
                    updated.set(resourceKey, decoded.resource);
                  }
                  deleted.delete(resourceKey);
                }
                for (const resource of Object.values(before)) {
                  if (after[resource.id] !== undefined) continue;
                  const projected = yield* projectAggregateFrontendResource({
                    aggregateName: key.aggregateName,
                    frontendName: key.frontendName,
                    modelName: selection.model.modelName,
                    resource,
                  });
                  const decoded = yield* Schema.decodeUnknownEffect(
                    Schema.Struct({
                      modelName: Schema.String,
                      resource: EncodedResourceSchema,
                    }),
                  )(projected, { onExcessProperty: 'error' }).pipe(
                    mapParseError({
                      code: 'materialized-aggregate-frontend-projection-invalid',
                      prefix: `Projection for removed ${modelName}.${resource.id} returned invalid output`,
                    }),
                  );
                  const resourceKey = `${decoded.modelName}\u0000${decoded.resource.id}`;
                  inserted.delete(resourceKey);
                  updated.delete(resourceKey);
                  deleted.set(resourceKey, {
                    id: decoded.resource.id,
                    modelName: decoded.modelName,
                  });
                }
              }
              return { deleted, inserted, updated };
            }).pipe(Effect.result);

            const inserted = Result.isSuccess(projection)
              ? projection.success.inserted
              : new Map<string, IEncodedResourceShape>();
            const updated = Result.isSuccess(projection)
              ? projection.success.updated
              : new Map<string, IEncodedResourceShape>();
            const deleted = Result.isSuccess(projection)
              ? projection.success.deleted
              : new Map<string, IRef>();

            for (const resource of [
              ...inserted.values(),
              ...updated.values(),
            ]) {
              const model = yield* getByKeyOrThrow({
                record: frontendModels,
                key: resource.modelName,
                recordKind: 'frontend models',
              });
              upsertHelper({
                table: model.drizzleSchema,
                tx,
                values: resource,
              });
            }
            for (const resource of deleted.values()) {
              const model = yield* getByKeyOrThrow({
                record: frontendModels,
                key: resource.modelName,
                recordKind: 'frontend models',
              });
              tx.delete(model.drizzleSchema)
                .where(eq(model.drizzleSchema.id, resource.id))
                .run();
            }

            const isOrigin =
              'aggregateId' in command &&
              command.aggregateId === key.aggregateId &&
              command.aggregateName === key.aggregateName &&
              command.userId === key.userId &&
              command.frontendName === key.frontendName &&
              command.pushIndex !== null;
            if (isOrigin) {
              const active = activeRows.find(
                row =>
                  row.pushIndex === command.pushIndex &&
                  row.commandId === command.id,
              );
              if (active === undefined) {
                return yield* new ZerospinError({
                  code: 'materialized-aggregate-frontend-origin-push-missing',
                  message: `Aggregate source ${command.aggregateIndex} resolves an unknown push`,
                });
              }
              tx.delete(
                materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism,
              )
                .where(
                  eq(
                    materializedAggregateFrontendRepoDrizzleSchemas
                      .activeOptimism.pushIndex,
                    command.pushIndex,
                  ),
                )
                .run();
              tx.insert(
                materializedAggregateFrontendRepoDrizzleSchemas.resolvedPushes,
              )
                .values({
                  pushIndex: command.pushIndex,
                  commandId: command.id,
                })
                .run();
            }

            for (const active of [...activeRows]
              .filter(row => !isOrigin || row.pushIndex !== command.pushIndex)
              .reverse()) {
              const forwardMutations = yield* Schema.decodeEffect(
                Schema.fromJsonString(
                  Schema.Array(EncodedAppliedMutationSchema),
                ),
              )(active.forwardMutations).pipe(
                mapParseError({
                  code: 'materialized-aggregate-frontend-forward-mutations-invalid',
                  prefix: `Failed to decode forward mutations for pushIndex ${active.pushIndex}`,
                }),
              );
              const currentInverses: IEncodedAppliedMutation[] = [];
              for (const forward of forwardMutations) {
                const model = yield* getByKeyOrThrow({
                  record: frontendModels,
                  key: forward.modelName,
                  recordKind: 'frontend models',
                });
                const decoded = yield* decodeAppliedMutation({
                  mutation: forward,
                  model,
                });
                const replayed = yield* applyAggregateFrontendMutationTx({
                  tx,
                  mutation: decoded,
                  commandId: forward.commandId,
                  mutationIndex: forward.mutationIndex,
                  appliedAt: forward.appliedAt,
                });
                currentInverses.push(
                  yield* encodeAppliedMutation({ mutation: replayed }),
                );
              }
              const encodedCurrentInverses = yield* Schema.encodeEffect(
                Schema.fromJsonString(
                  Schema.Array(EncodedAppliedMutationSchema),
                ),
              )(currentInverses).pipe(
                mapParseError({
                  code: 'materialized-aggregate-frontend-current-inverses-encode-failed',
                  prefix: `Failed to encode replayed inverses for pushIndex ${active.pushIndex}`,
                }),
              );
              tx.update(
                materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism,
              )
                .set({ currentInverses: encodedCurrentInverses })
                .where(
                  eq(
                    materializedAggregateFrontendRepoDrizzleSchemas
                      .activeOptimism.pushIndex,
                    active.pushIndex,
                  ),
                )
                .run();
            }

            let frontendIndex = state.frontendIndex;
            let resultBytes: string | null = null;
            const completedAt = new Date();
            const shouldFinalize =
              isOrigin ||
              Result.isFailure(projection) ||
              inserted.size !== 0 ||
              updated.size !== 0 ||
              deleted.size !== 0;
            if (shouldFinalize) {
              frontendIndex += 1;
              const finalized = yield* Schema.decodeUnknownEffect(
                Schema.toType(AggregateFrontendFinalizedCommandSchema),
              )(
                Result.isFailure(projection)
                  ? {
                      ...command,
                      frontendIndex,
                      delta: {
                        inserted: [],
                        updated: [],
                        deleted: [],
                        mutations: [],
                      },
                      failedAt: completedAt,
                      failure: Schema.encodeSync(ZerospinError.schema)(
                        projection.failure,
                      ),
                    }
                  : {
                      ...command,
                      frontendIndex,
                      delta: {
                        inserted: [...inserted.values()],
                        updated: [...updated.values()],
                        deleted: [...deleted.values()],
                        mutations: [],
                      },
                    },
                { onExcessProperty: 'error' },
              ).pipe(
                mapParseError({
                  code: 'materialized-aggregate-frontend-finalized-command-invalid',
                  prefix: `Failed to create finalized command ${frontendIndex}`,
                }),
              );
              resultBytes = yield* Schema.encodeEffect(
                Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
              )(finalized).pipe(
                mapParseError({
                  code: 'materialized-aggregate-frontend-finalized-command-encode-failed',
                  prefix: `Failed to encode finalized command ${frontendIndex}`,
                }),
              );
              tx.insert(
                materializedAggregateFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
              )
                .values({
                  frontendIndex,
                  commandId: command.id,
                  canonicalBytes: resultBytes,
                  command: resultBytes,
                  publishedAt: null,
                  failure: null,
                })
                .run();
            }

            tx.update(
              materializedAggregateFrontendRepoDrizzleSchemas.executionClaims,
            )
              .set({ completedAt, result: resultBytes })
              .where(
                eq(
                  materializedAggregateFrontendRepoDrizzleSchemas
                    .executionClaims.aggregateIndex,
                  command.aggregateIndex,
                ),
              )
              .run();
            tx.update(
              materializedAggregateFrontendRepoDrizzleSchemas.projectionState,
            )
              .set({
                aggregateIndex: command.aggregateIndex,
                frontendIndex,
              })
              .where(
                eq(
                  materializedAggregateFrontendRepoDrizzleSchemas
                    .projectionState.id,
                  1,
                ),
              )
              .run();
          }),
        });
        currentAggregateIndex = command.aggregateIndex;
      }

      if (
        props.throughAggregateIndex !== undefined &&
        currentAggregateIndex >= props.throughAggregateIndex
      ) {
        return;
      }
      if (currentAggregateIndex >= observedTip) {
        if (props.throughAggregateIndex !== undefined) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-frontend-catchup-history-incomplete',
            message: `Aggregate history tip did not reach ${props.throughAggregateIndex}`,
          });
        }
        return;
      }
    }
  },
);
