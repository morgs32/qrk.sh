import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import {
  AggregateChainedCommandSchema,
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  type ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IAggregateCommand,
  IAnyMutation,
  IAppliedMutation,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IEncodedDeletedResourceShape,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { eq, or } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { getAggregateCommandChain } from '../../AggregateCommandChain/getAggregateCommandChain/getAggregateCommandChain.js';
import { getMaterializedServiceRepo } from '../../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';
import { getServiceCommandChain } from '../../ServiceCommandChain/getServiceCommandChain/getServiceCommandChain.js';
import { catchup } from '../catchup/catchup.js';
import { materializedAggregateRepoDrizzleSchemas } from '../MaterializedAggregateRepoDbConfig.js';

export const execute = Effect.fn('MaterializedAggregateRepo.execute')(
  function* (props: {
    command: Schema.Schema.Type<typeof AggregateChainedCommandSchema>;
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
    };
  }): Effect.fn.Return<
    Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
    IAnyError,
    Async | CuidFactory
  > {
    const { command, db, key } = props;
    if (
      command.delta !== null ||
      (!('serviceName' in command) &&
        (command.aggregateId !== key.aggregateId ||
          command.aggregateName !== key.aggregateName))
    ) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-command-invalid',
        message:
          'MaterializedAggregateRepo.execute requires its bound pending aggregate occurrence',
      });
    }
    const canonicalBytes = yield* Effect.gen(function* () {
      if ('serviceName' in command) {
        const {
          aggregateIndex: _aggregateIndex,
          serviceIndex: _serviceIndex,
          chainedAt: _chainedAt,
          delta: _delta,
          failedAt: _failedAt,
          failure: _failure,
          ...inputCommand
        } = command;
        return yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(inputCommand);
      }
      const {
        aggregateIndex: _aggregateIndex,
        chainedAt: _chainedAt,
        delta: _delta,
        failedAt: _failedAt,
        failure: _failure,
        ...inputCommand
      } = command;
      return yield* Schema.encodeEffect(
        Schema.fromJsonString(EncodedAggregateCommandSchema),
      )(inputCommand);
    }).pipe(
      mapParseError({
        code: 'materialized-aggregate-command-encode-failed',
        prefix: `Failed to encode aggregate execution ${command.aggregateIndex}`,
      }),
    );

    const currentAggregateIndex =
      db
        .select()
        .from(materializedAggregateRepoDrizzleSchemas.materializationState)
        .where(
          eq(
            materializedAggregateRepoDrizzleSchemas.materializationState.id,
            1,
          ),
        )
        .get()?.aggregateIndex ?? 0;
    if (command.aggregateIndex > currentAggregateIndex + 1) {
      yield* catchup({
        db,
        key,
        throughAggregateIndex: command.aggregateIndex - 1,
      });
    }

    const existing = db
      .select()
      .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
      .where(
        or(
          eq(
            materializedAggregateRepoDrizzleSchemas.executionClaims
              .aggregateIndex,
            command.aggregateIndex,
          ),
          eq(
            materializedAggregateRepoDrizzleSchemas.executionClaims.commandId,
            command.id,
          ),
        ),
      )
      .get();
    if (existing !== undefined) {
      if (
        existing.aggregateIndex !== command.aggregateIndex ||
        existing.commandId !== command.id ||
        existing.canonicalBytes !== canonicalBytes ||
        existing.chainedAt.getTime() !== command.chainedAt.getTime()
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-command-conflict',
          message: `Aggregate execution ${command.aggregateIndex} differs from its retained bytes`,
        });
      }
      if (existing.result === null) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-execution-in-doubt',
          message: `Aggregate execution ${command.aggregateIndex} was claimed without a retained result`,
        });
      }
      return yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(AggregateChainedCommandSchema),
      )(existing.result).pipe(
        mapParseError({
          code: 'materialized-aggregate-result-invalid',
          prefix: `Failed to decode retained aggregate execution ${command.aggregateIndex}`,
        }),
      );
    }

    const state = db
      .select()
      .from(materializedAggregateRepoDrizzleSchemas.materializationState)
      .where(
        eq(
          materializedAggregateRepoDrizzleSchemas.materializationState.id,
          1,
        ),
      )
      .get();
    const expectedAggregateIndex = (state?.aggregateIndex ?? 0) + 1;
    if (command.aggregateIndex !== expectedAggregateIndex) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-index-gap',
        message: `MaterializedAggregateRepo expected aggregateIndex ${expectedAggregateIndex}, received ${command.aggregateIndex}`,
      });
    }

    db.insert(materializedAggregateRepoDrizzleSchemas.executionClaims)
      .values({
        aggregateIndex: command.aggregateIndex,
        commandId: command.id,
        canonicalBytes,
        chainedAt: command.chainedAt,
        command: canonicalBytes,
        claimedAt: new Date(),
        result: null,
      })
      .run();

    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const prepared = yield* Effect.gen(function* () {
      if ('serviceName' in command) {
        const serviceCommandChain = yield* getServiceCommandChain({
          key: {
            systemId: key.systemId,
            serviceName: command.serviceName,
          },
        });
        const page = yield* makeAsync<
          IEncodedResult<
            Readonly<{
              commands: readonly Schema.Schema.Type<
                typeof ServiceChainedCommandSchema
              >[];
              tip: number | null;
            }>,
            IAnyErrorJson
          >,
          IAnyError
        >(
          () =>
            serviceCommandChain.getCommands({
              afterServiceIndex:
                command.serviceIndex === 1 ? null : command.serviceIndex - 1,
            }),
          ZerospinError.catch({
            code: 'materialized-aggregate-service-history-rpc-failed',
            message: `Failed to pull serviceIndex ${command.serviceIndex}`,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const source = page.commands[0];
        if (
          source === undefined ||
          source.serviceIndex !== command.serviceIndex ||
          source.delta === null
        ) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-service-history-incomplete',
            message: `Service history did not contain terminal serviceIndex ${command.serviceIndex}`,
          });
        }
        const {
          serviceIndex: _sourceServiceIndex,
          chainedAt: _sourceChainedAt,
          delta: _sourceDelta,
          failedAt: _sourceFailedAt,
          failure: _sourceFailure,
          ...sourceInput
        } = source;
        const sourceBytes = yield* Schema.encodeEffect(
          Schema.fromJsonString(EncodedServiceCommandSchema),
        )(sourceInput).pipe(
          mapParseError({
            code: 'materialized-aggregate-service-command-encode-failed',
            prefix: `Failed to encode serviceIndex ${command.serviceIndex}`,
          }),
        );
        if (sourceBytes !== canonicalBytes) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-service-command-conflict',
            message: `Service execution ${command.serviceIndex} differs from its source occurrence`,
          });
        }
        return Result.succeed({
          kind: 'service',
          serviceIndex: command.serviceIndex,
          serviceName: command.serviceName,
          changedResources: [
            ...source.delta.inserted.map(resource => ({
              deleted: false,
              resource,
            })),
            ...source.delta.updated.map(resource => ({
              deleted: false,
              resource,
            })),
            ...source.delta.deleted.map(resource => ({
              deleted: true,
              resource,
            })),
          ],
        } satisfies Readonly<{
          kind: 'service';
          serviceIndex: number;
          serviceName: string;
          changedResources: readonly Readonly<{
            deleted: boolean;
            resource: IEncodedResourceShape | IEncodedDeletedResourceShape;
          }>[];
        }>);
      }

      const authored = yield* Effect.gen(function* () {
        const contract = Object.values(aggregate.contracts).find(
          candidate => candidate.commandName === command.commandName,
        );
        if (contract === undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-contract-not-found',
            message: `Aggregate contract "${command.commandName}" was not found`,
          });
        }
        const payload = yield* contract.decodeAndAdaptPayload({ command });
        const decodedCommand: IAggregateCommand = {
          ...command,
          payload,
        };
        const made = yield* makeMutations({
          contract,
          models: aggregate.models,
          owner: { kind: 'aggregate' },
          command: decodedCommand,
        });
        const mutations: IAnyMutation[] = [...made.mutations];
        const serviceGroups: Array<{
          serviceName: string;
          refs: Array<{
            mutationIndex: number;
            modelName: string;
            resourceId: string;
          }>;
          hadExistingReplica: boolean;
        }> = [];
        for (const [mutationIndex, mutation] of mutations.entries()) {
          if (mutation.operationName !== 'replicateResource') continue;
          if (!('sourceModel' in mutation.model)) {
            return yield* new ZerospinError({
              code: 'replication-model-required',
              message: `Mutation ${mutationIndex} does not target a replica model`,
            });
          }
          const service = yield* getByKeyOrThrow({
            record: system.services,
            key: mutation.operation.serviceName,
            recordKind: 'services',
          });
          if (
            Reflect.get(mutation.model, 'serviceName') !==
              mutation.operation.serviceName ||
            Reflect.get(mutation.model, 'sourceModel') !==
              service.models[mutation.model.modelName]
          ) {
            return yield* new ZerospinError({
              code: 'replication-service-model-mismatch',
              message: `Replication model "${mutation.model.modelName}" does not match service "${mutation.operation.serviceName}"`,
            });
          }
          let group = serviceGroups.find(
            candidate =>
              candidate.serviceName === mutation.operation.serviceName,
          );
          if (group === undefined) {
            let hadExistingReplica = false;
            for (const model of Object.values(aggregate.models)) {
              if (
                'sourceModel' in model &&
                Reflect.get(model, 'serviceName') ===
                  mutation.operation.serviceName &&
                db.select().from(model.drizzleSchema).limit(1).get() !==
                  undefined
              ) {
                hadExistingReplica = true;
                break;
              }
            }
            group = {
              serviceName: mutation.operation.serviceName,
              refs: [],
              hadExistingReplica,
            };
            serviceGroups.push(group);
          }
          group.refs.push({
            mutationIndex,
            modelName: mutation.model.modelName,
            resourceId: mutation.resourceId,
          });
        }
        return { mutations, serviceGroups };
      }).pipe(Effect.result);
      if (authored._tag === 'Failure') return authored;

      const { mutations, serviceGroups } = authored.success;
      for (const group of serviceGroups) {
        const materializedServiceRepo = yield* getMaterializedServiceRepo({
          key: { systemId: key.systemId, serviceName: group.serviceName },
        });
        const snapshot = yield* makeAsync<
          IEncodedResult<
            Readonly<{
              resources: readonly unknown[];
              serviceIndex: number;
            }>,
            IAnyErrorJson
          >,
          IAnyError
        >(
          () =>
            materializedServiceRepo.getReplicatedResources({
              resources: group.refs.map(ref => ({
                modelName: ref.modelName,
                resourceId: ref.resourceId,
              })),
            }),
          ZerospinError.catch({
            code: 'materialized-aggregate-replication-snapshot-rpc-failed',
            message: `Failed to capture service ${group.serviceName}`,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (snapshot.resources.length !== group.refs.length) {
          return yield* new ZerospinError({
            code: 'materialized-aggregate-replication-snapshot-incomplete',
            message: `Service ${group.serviceName} returned an incomplete resource snapshot`,
          });
        }
        for (const [resourceIndex, ref] of group.refs.entries()) {
          const result = snapshot.resources[resourceIndex];
          if (
            result === null ||
            typeof result !== 'object' ||
            !('status' in result) ||
            !('modelName' in result) ||
            !('resourceId' in result) ||
            result.modelName !== ref.modelName ||
            result.resourceId !== ref.resourceId
          ) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-replication-snapshot-position-mismatch',
              message: `Service ${group.serviceName} returned another resource at position ${resourceIndex}`,
            });
          }
          if (result.status === 'missing') {
            if (!('failure' in result)) {
              return yield* new ZerospinError({
                code: 'materialized-aggregate-replication-failure-missing',
                message: `Missing service resource ${ref.modelName}.${ref.resourceId} omitted its failure`,
              });
            }
            const failure = yield* Schema.decodeUnknownEffect(
              Schema.toEncoded(ZerospinError.schema),
            )(result.failure).pipe(
              mapParseError({
                code: 'materialized-aggregate-replication-failure-invalid',
                prefix: `Failed to decode missing service resource ${ref.modelName}.${ref.resourceId}`,
              }),
            );
            return yield* new ZerospinError(failure);
          }
          if (result.status !== 'found' || !('resource' in result)) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-replication-result-invalid',
              message: `Service ${group.serviceName} returned an invalid resource result`,
            });
          }
          const mutation = mutations[ref.mutationIndex];
          if (
            mutation === undefined ||
            mutation.operationName !== 'replicateResource'
          ) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-replication-mutation-missing',
              message: `Replication mutation ${ref.mutationIndex} is missing`,
            });
          }
          const sourceModel = yield* getByKeyOrThrow({
            record: system.services[group.serviceName]?.models ?? {},
            key: mutation.model.modelName,
            recordKind: `models owned by service ${group.serviceName}`,
          });
          const resource = yield* Schema.decodeUnknownEffect(
            Schema.toType(sourceModel.resourceSchema),
          )(result.resource, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'materialized-aggregate-replicated-resource-invalid',
              prefix: `Failed to decode ${group.serviceName}.${ref.modelName}.${ref.resourceId}`,
            }),
          );
          mutations[ref.mutationIndex] = {
            ...mutation,
            operation: {
              ...mutation.operation,
              resource: { ...resource, deletedAt: null },
            },
          };
        }
        if (!group.hadExistingReplica) {
          const aggregateCommandChain = yield* getAggregateCommandChain({ key });
          yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
            () =>
              aggregateCommandChain.subscribeService({
                currentServiceIndex:
                  snapshot.serviceIndex === 0 ? null : snapshot.serviceIndex,
                serviceName: group.serviceName,
              }),
            ZerospinError.catch({
              code: 'materialized-aggregate-service-subscription-rpc-failed',
              message: `Failed to subscribe aggregate at ${group.serviceName} frontier ${snapshot.serviceIndex}`,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }
      }
      return Result.succeed({
        kind: 'aggregate',
        mutations,
      } satisfies Readonly<{
        kind: 'aggregate';
        mutations: readonly IAnyMutation[];
      }>);
    });
    const now = new Date();

    return yield* makeTx({
      db,
      program: Effect.fn('MaterializedAggregateRepo.execute.transaction')(
        function* ({ tx }) {
          const liveState = tx
            .select()
            .from(materializedAggregateRepoDrizzleSchemas.materializationState)
            .where(
              eq(
                materializedAggregateRepoDrizzleSchemas.materializationState
                  .id,
                1,
              ),
            )
            .get();
          if ((liveState?.aggregateIndex ?? 0) + 1 !== command.aggregateIndex) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-state-conflict',
              message: `Aggregate frontier changed before ${command.aggregateIndex} committed`,
            });
          }
          const liveClaim = tx
            .select()
            .from(materializedAggregateRepoDrizzleSchemas.executionClaims)
            .where(
              eq(
                materializedAggregateRepoDrizzleSchemas.executionClaims
                  .aggregateIndex,
                command.aggregateIndex,
              ),
            )
            .get();
          if (
            liveClaim === undefined ||
            liveClaim.canonicalBytes !== canonicalBytes ||
            liveClaim.result !== null
          ) {
            return yield* new ZerospinError({
              code: 'materialized-aggregate-claim-conflict',
              message: `Execution claim ${command.aggregateIndex} changed before commit`,
            });
          }

          const beforeByResource = new Map<
            string,
            IEncodedResourceShape | undefined
          >();
          const modelNameByResource = new Map<string, string>();
          const resourceIdByResource = new Map<string, string>();
          const appliedMutations: IAppliedMutation[] = [];
          let applied: Result.Result<void, IAnyError>;
          if (prepared._tag === 'Failure') {
            applied = Result.fail(prepared.failure);
          } else if (prepared.success.kind === 'aggregate') {
            const aggregateCommand = prepared.success;
            applied = yield* withSavepoint({
              tx,
              program: Effect.fn(
                'MaterializedAggregateRepo.execute.command',
              )(function* ({ tx: commandTx }) {
                for (const [
                  mutationIndex,
                  mutation,
                ] of aggregateCommand.mutations.entries()) {
                  const resourceKey = `${mutation.model.modelName}\u0000${mutation.resourceId}`;
                  if (!beforeByResource.has(resourceKey)) {
                    const beforeRow = commandTx
                      .select()
                      .from(mutation.model.drizzleSchema)
                      .where(
                        eq(
                          mutation.model.drizzleSchema.id,
                          mutation.resourceId,
                        ),
                      )
                      .get();
                    beforeByResource.set(
                      resourceKey,
                      beforeRow === undefined
                        ? undefined
                        : yield* Schema.decodeUnknownEffect(
                            Schema.toType(EncodedResourceSchema),
                          )(beforeRow).pipe(
                            mapParseError({
                              code: 'materialized-aggregate-before-resource-invalid',
                              prefix: `Failed to decode ${mutation.model.modelName}.${mutation.resourceId}`,
                            }),
                          ),
                    );
                  }
                  modelNameByResource.set(
                    resourceKey,
                    mutation.model.modelName,
                  );
                  resourceIdByResource.set(resourceKey, mutation.resourceId);
                  appliedMutations.push(
                    yield* applyAggregateMutationTx({
                      tx: commandTx,
                      mutation,
                      commandId: command.id,
                      mutationIndex,
                      appliedAt: now,
                    }),
                  );
                }
              }),
            }).pipe(Effect.result);
          } else {
            const serviceCommand = prepared.success;
            applied = Result.succeed(
              yield* withSavepoint({
                tx,
                program: Effect.fn(
                  'MaterializedAggregateRepo.execute.serviceCommand',
                )(function* ({ tx: commandTx }) {
                  const changedKeys = serviceCommand.changedResources.map(
                    change =>
                      `${change.resource.modelName}\u0000${change.resource.id}`,
                  );
                  if (new Set(changedKeys).size !== changedKeys.length) {
                    return yield* new ZerospinError({
                      code: 'materialized-aggregate-service-delta-resource-duplicate',
                      message: `Service occurrence ${serviceCommand.serviceIndex} changes one resource more than once`,
                    });
                  }
                  const service = yield* getByKeyOrThrow({
                    record: system.services,
                    key: serviceCommand.serviceName,
                    recordKind: 'services',
                  });
                  for (const change of serviceCommand.changedResources) {
                    const model = aggregate.models[change.resource.modelName];
                    if (
                      model === undefined ||
                      !('sourceModel' in model) ||
                      Reflect.get(model, 'serviceName') !==
                        serviceCommand.serviceName ||
                      Reflect.get(model, 'sourceModel') !==
                        service.models[change.resource.modelName]
                    ) {
                      continue;
                    }
                    const beforeRow = commandTx
                      .select()
                      .from(model.drizzleSchema)
                      .where(eq(model.drizzleSchema.id, change.resource.id))
                      .get();
                    if (beforeRow === undefined) continue;
                    const resourceKey = `${model.modelName}\u0000${change.resource.id}`;
                    beforeByResource.set(
                      resourceKey,
                      yield* Schema.decodeUnknownEffect(
                        Schema.toType(EncodedResourceSchema),
                      )(beforeRow).pipe(
                        mapParseError({
                          code: 'materialized-aggregate-before-resource-invalid',
                          prefix: `Failed to decode ${model.modelName}.${change.resource.id}`,
                        }),
                      ),
                    );
                    modelNameByResource.set(resourceKey, model.modelName);
                    resourceIdByResource.set(resourceKey, change.resource.id);
                    upsertHelper({
                      table: model.drizzleSchema,
                      tx: commandTx,
                      values: change.deleted
                        ? change.resource
                        : { ...change.resource, deletedAt: null },
                    });
                  }
                }),
              }),
            );
          }

          const inserted: IEncodedResourceShape[] = [];
          const updated: IEncodedResourceShape[] = [];
          const deleted: IEncodedDeletedResourceShape[] = [];
          if (Result.isSuccess(applied)) {
            for (const [resourceKey, before] of beforeByResource) {
              const modelName = modelNameByResource.get(resourceKey);
              const resourceId = resourceIdByResource.get(resourceKey);
              const model =
                modelName === undefined
                  ? undefined
                  : aggregate.models[modelName];
              if (
                modelName === undefined ||
                resourceId === undefined ||
                model === undefined
              ) {
                return yield* new ZerospinError({
                  code: 'materialized-aggregate-delta-metadata-missing',
                  message: `Aggregate delta metadata is missing for ${resourceKey}`,
                });
              }
              const afterRow = tx
                .select()
                .from(model.drizzleSchema)
                .where(eq(model.drizzleSchema.id, resourceId))
                .get();
              if (afterRow === undefined) {
                if (before !== undefined) {
                  deleted.push({ ...before, updatedAt: now, deletedAt: now });
                }
                continue;
              }
              const after = yield* Schema.decodeUnknownEffect(
                Schema.toType(EncodedResourceSchema),
              )(afterRow).pipe(
                mapParseError({
                  code: 'materialized-aggregate-after-resource-invalid',
                  prefix: `Failed to decode ${modelName}.${resourceId}`,
                }),
              );
              const beforeIsLive =
                before !== undefined &&
                (before.deletedAt === undefined || before.deletedAt === null);
              if (after.deletedAt !== undefined && after.deletedAt !== null) {
                if (beforeIsLive) {
                  deleted.push({ ...after, deletedAt: after.deletedAt });
                }
              } else if (!beforeIsLive) {
                inserted.push(after);
              } else if (
                JSON.stringify(
                  Schema.encodeSync(EncodedResourceSchema)(before),
                ) !==
                JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(after))
              ) {
                updated.push(after);
              }
            }
          }
          const terminal = yield* Schema.decodeUnknownEffect(
            Schema.toType(AggregateChainedCommandSchema),
          )(
            Result.isFailure(applied)
              ? {
                  ...command,
                  delta: {
                    inserted: [],
                    updated: [],
                    deleted: [],
                    mutations: [],
                  },
                  failedAt: now,
                  failure: Schema.encodeSync(ZerospinError.schema)(
                    applied.failure,
                  ),
                }
              : {
                  ...command,
                  delta: {
                    inserted,
                    updated,
                    deleted,
                    mutations: yield* Effect.forEach(
                      appliedMutations,
                      mutation => encodeAppliedMutation({ mutation }),
                    ),
                  },
                  failedAt: null,
                  failure: null,
                },
          ).pipe(
            mapParseError({
              code: 'materialized-aggregate-terminal-command-invalid',
              prefix: `Failed to create aggregate result ${command.aggregateIndex}`,
            }),
          );
          const resultBytes = yield* Schema.encodeEffect(
            Schema.fromJsonString(AggregateChainedCommandSchema),
          )(terminal).pipe(
            mapParseError({
              code: 'materialized-aggregate-result-encode-failed',
              prefix: `Failed to encode aggregate result ${command.aggregateIndex}`,
            }),
          );
          tx.update(materializedAggregateRepoDrizzleSchemas.executionClaims)
            .set({ result: resultBytes })
            .where(
              eq(
                materializedAggregateRepoDrizzleSchemas.executionClaims
                  .aggregateIndex,
                command.aggregateIndex,
              ),
            )
            .run();
          tx.insert(
            materializedAggregateRepoDrizzleSchemas.materializationState,
          )
            .values({ id: 1, aggregateIndex: command.aggregateIndex })
            .onConflictDoUpdate({
              target:
                materializedAggregateRepoDrizzleSchemas.materializationState
                  .id,
              set: { aggregateIndex: command.aggregateIndex },
            })
            .run();
          return terminal;
        },
      ),
    });
  },
);
