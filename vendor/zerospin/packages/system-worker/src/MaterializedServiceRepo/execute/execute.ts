import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IAppliedMutation,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IEncodedDeletedResourceShape,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { catchup } from '../catchup/catchup.js';
import { materializedServiceRepoDrizzleSchemas } from '../MaterializedServiceRepoDbConfig.js';

export const execute = Effect.fn('MaterializedServiceRepo.execute')(
  function* (props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
    db: IDb;
    serviceName: string;
    systemId: string;
  }) {
    const { command, db, serviceName } = props;
    if (command.serviceName !== serviceName || command.delta !== null) {
      return yield* new ZerospinError({
        code: 'materialized-service-command-invalid',
        message:
          'MaterializedServiceRepo.execute requires its bound pending service command',
      });
    }
    const {
      serviceIndex: _serviceIndex,
      chainedAt: _chainedAt,
      delta: _delta,
      failedAt: _failedAt,
      failure: _failure,
      ...inputCommand
    } = command;
    const canonicalBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(EncodedServiceCommandSchema),
    )(inputCommand).pipe(
      mapParseError({
        code: 'materialized-service-command-encode-failed',
        prefix: `Failed to encode service execution ${command.serviceIndex}`,
      }),
    );
    const currentServiceIndex =
      db
        .select()
        .from(materializedServiceRepoDrizzleSchemas.materializationState)
        .where(
          eq(materializedServiceRepoDrizzleSchemas.materializationState.id, 1),
        )
        .get()?.serviceIndex ?? 0;
    if (command.serviceIndex > currentServiceIndex + 1) {
      yield* catchup({
        db,
        serviceName,
        systemId: props.systemId,
        throughServiceIndex: command.serviceIndex - 1,
      });
    }
    const existing = db
      .select()
      .from(materializedServiceRepoDrizzleSchemas.executionClaims)
      .where(
        or(
          eq(
            materializedServiceRepoDrizzleSchemas.executionClaims.serviceIndex,
            command.serviceIndex,
          ),
          eq(
            materializedServiceRepoDrizzleSchemas.executionClaims.commandId,
            command.id,
          ),
        ),
      )
      .get();
    if (existing !== undefined) {
      if (
        existing.serviceIndex !== command.serviceIndex ||
        existing.commandId !== command.id ||
        existing.canonicalBytes !== canonicalBytes ||
        existing.chainedAt.getTime() !== command.chainedAt.getTime()
      ) {
        return yield* new ZerospinError({
          code: 'materialized-service-command-conflict',
          message: `Service execution ${command.serviceIndex} differs from its retained bytes`,
        });
      }
      if (existing.result === null) {
        return yield* new ZerospinError({
          code: 'materialized-service-execution-in-doubt',
          message: `Service execution ${command.serviceIndex} was claimed without a retained result`,
        });
      }
      return yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(ServiceChainedCommandSchema),
      )(existing.result).pipe(
        mapParseError({
          code: 'materialized-service-result-invalid',
          prefix: `Failed to decode retained service execution ${command.serviceIndex}`,
        }),
      );
    }

    const state = db
      .select()
      .from(materializedServiceRepoDrizzleSchemas.materializationState)
      .where(
        eq(materializedServiceRepoDrizzleSchemas.materializationState.id, 1),
      )
      .get();
    const expectedServiceIndex = (state?.serviceIndex ?? 0) + 1;
    if (command.serviceIndex !== expectedServiceIndex) {
      return yield* new ZerospinError({
        code: 'materialized-service-index-gap',
        message: `MaterializedServiceRepo expected serviceIndex ${expectedServiceIndex}, received ${command.serviceIndex}`,
      });
    }

    db.insert(materializedServiceRepoDrizzleSchemas.executionClaims)
      .values({
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        canonicalBytes,
        chainedAt: command.chainedAt,
        command: canonicalBytes,
        claimedAt: new Date(),
        result: null,
      })
      .run();

    const service = yield* getByKeyOrThrow({
      record: system.services,
      key: serviceName,
      recordKind: 'services',
    });
    let decodedCommand: IServiceCommand = command;
    const prepared = yield* Effect.gen(function* () {
      const contract = Object.values(service.contracts).find(
        candidate => candidate.commandName === command.commandName,
      );
      if (contract === undefined) {
        return yield* new ZerospinError({
          code: 'service-contract-not-found',
          message: `Service contract "${command.commandName}" was not found`,
        });
      }
      const payload = yield* contract.decodeAndAdaptPayload({ command });
      decodedCommand = { ...command, payload };
      const mutations = yield* makeMutations({
        contract,
        models: service.models,
        owner: { kind: 'service', serviceName: service.name },
        command: decodedCommand,
      });
      return mutations.mutations;
    }).pipe(Effect.result);
    const now = new Date();

    return yield* makeTx({
      db,
      program: Effect.fn('MaterializedServiceRepo.execute.transaction')(
        function* ({ tx }) {
          const beforeByResource = new Map<
            string,
            IEncodedResourceShape | undefined
          >();
          const modelNameByResource = new Map<string, string>();
          const resourceIdByResource = new Map<string, string>();
          const appliedMutations: IAppliedMutation[] = [];
          const applied = Result.isFailure(prepared)
            ? Result.fail(prepared.failure)
            : yield* withSavepoint({
                tx,
                program: Effect.fn('MaterializedServiceRepo.execute.command')(
                  function* ({ tx: commandTx }) {
                    for (const [
                      mutationIndex,
                      mutation,
                    ] of prepared.success.entries()) {
                      if (mutation.operationName === 'replicateResource') {
                        return yield* new ZerospinError({
                          code: 'service-contract-cannot-replicate-resource',
                          message: `Service contract ${command.commandName} cannot emit replicateResource`,
                        });
                      }
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
                                  code: 'materialized-service-before-resource-invalid',
                                  prefix: `Failed to decode ${mutation.model.modelName}.${mutation.resourceId}`,
                                }),
                              ),
                        );
                      }
                      modelNameByResource.set(
                        resourceKey,
                        mutation.model.modelName,
                      );
                      resourceIdByResource.set(
                        resourceKey,
                        mutation.resourceId,
                      );
                      appliedMutations.push(
                        yield* applyMutationTx({
                          tx: commandTx,
                          mutation,
                          commandId: command.id,
                          mutationIndex,
                          appliedAt: now,
                        }),
                      );
                    }
                  },
                ),
              }).pipe(Effect.result);

          const inserted: IEncodedResourceShape[] = [];
          const updated: IEncodedResourceShape[] = [];
          const deleted: IEncodedDeletedResourceShape[] = [];
          if (Result.isSuccess(applied)) {
            for (const [resourceKey, before] of beforeByResource) {
              const modelName = modelNameByResource.get(resourceKey);
              const resourceId = resourceIdByResource.get(resourceKey);
              const model =
                modelName === undefined ? undefined : service.models[modelName];
              if (
                modelName === undefined ||
                resourceId === undefined ||
                model === undefined
              ) {
                return yield* new ZerospinError({
                  code: 'materialized-service-delta-metadata-missing',
                  message: `Service delta metadata is missing for ${resourceKey}`,
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
                  code: 'materialized-service-after-resource-invalid',
                  prefix: `Failed to decode ${modelName}.${resourceId}`,
                }),
              );
              if (before === undefined) {
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
            Schema.toType(ServiceChainedCommandSchema),
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
              code: 'materialized-service-terminal-command-invalid',
              prefix: `Failed to create service result ${command.serviceIndex}`,
            }),
          );
          const resultBytes = yield* Schema.encodeEffect(
            Schema.fromJsonString(ServiceChainedCommandSchema),
          )(terminal).pipe(
            mapParseError({
              code: 'materialized-service-result-encode-failed',
              prefix: `Failed to encode service result ${command.serviceIndex}`,
            }),
          );
          tx.update(materializedServiceRepoDrizzleSchemas.executionClaims)
            .set({ result: resultBytes })
            .where(
              eq(
                materializedServiceRepoDrizzleSchemas.executionClaims
                  .serviceIndex,
                command.serviceIndex,
              ),
            )
            .run();
          tx.insert(materializedServiceRepoDrizzleSchemas.materializationState)
            .values({ id: 1, serviceIndex: command.serviceIndex })
            .onConflictDoUpdate({
              target:
                materializedServiceRepoDrizzleSchemas.materializationState.id,
              set: { serviceIndex: command.serviceIndex },
            })
            .run();
          return terminal;
        },
      ),
    });
  },
);
