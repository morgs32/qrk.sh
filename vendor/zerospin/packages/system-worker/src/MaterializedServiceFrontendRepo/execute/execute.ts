import type { Async } from '@zerospin/core/async/Async';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IEncodedResourceShape,
  IModel,
  IModels,
  IRef,
} from '@zerospin/core/models/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import type { IAnyDrizzleSchemas } from '@zerospin/schema';
import { eq, or, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { catchup } from '../catchup/catchup.js';
import { materializedServiceFrontendRepoDrizzleSchemas } from '../MaterializedServiceFrontendRepoDbConfig.js';
import { projectServiceFrontendResource } from '../projectServiceFrontendResource/projectServiceFrontendResource.js';

export const execute = Effect.fn('MaterializedServiceFrontendRepo.execute')(
  function* (props: {
    command: Schema.Schema.Type<typeof ServiceChainedCommandSchema>;
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      userId: string;
      frontendName: string;
    };
    serviceFrontendRepoSchema: IAnyDrizzleSchemas &
      Record<`serviceSource_${string}`, IModel['drizzleSchema']>;
    storage: Pick<DurableObjectStorage, 'setAlarm'>;
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { command, db, key, serviceFrontendRepoSchema } = props;
    if (command.serviceName !== key.serviceName || command.delta === null) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-command-invalid',
        message:
          'MaterializedServiceFrontendRepo.execute requires its bound terminal service command',
      });
    }
    const canonicalBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(ServiceChainedCommandSchema),
    )(command).pipe(
      mapParseError({
        code: 'materialized-service-frontend-command-encode-failed',
        prefix: `Failed to encode service occurrence ${command.serviceIndex}`,
      }),
    );

    const currentServiceIndex =
      db
        .select()
        .from(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState,
        )
        .where(
          eq(
            materializedServiceFrontendRepoDrizzleSchemas.materializationState
              .id,
            1,
          ),
        )
        .get()?.serviceIndex ?? 0;
    if (command.serviceIndex > currentServiceIndex + 1) {
      yield* catchup({
        db,
        key,
        serviceFrontendRepoSchema,
        storage: props.storage,
        throughServiceIndex: command.serviceIndex - 1,
      });
    }

    const existing = db
      .select()
      .from(materializedServiceFrontendRepoDrizzleSchemas.executionClaims)
      .where(
        or(
          eq(
            materializedServiceFrontendRepoDrizzleSchemas.executionClaims
              .serviceIndex,
            command.serviceIndex,
          ),
          eq(
            materializedServiceFrontendRepoDrizzleSchemas.executionClaims
              .commandId,
            command.id,
          ),
        ),
      )
      .get();
    if (existing !== undefined) {
      if (
        existing.serviceIndex !== command.serviceIndex ||
        existing.commandId !== command.id ||
        existing.canonicalBytes !== canonicalBytes
      ) {
        return yield* new ZerospinError({
          code: 'materialized-service-frontend-command-conflict',
          message: `Service occurrence ${command.serviceIndex} differs from its retained claim`,
        });
      }
      if (existing.completedAt === null) {
        return yield* new ZerospinError({
          code: 'materialized-service-frontend-execution-in-doubt',
          message: `Service occurrence ${command.serviceIndex} was claimed without a retained result`,
        });
      }
      if (existing.result !== null) {
        yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
        )(existing.result).pipe(
          mapParseError({
            code: 'materialized-service-frontend-result-invalid',
            prefix: `Failed to decode retained frontend result ${command.serviceIndex}`,
          }),
        );
      }
      return;
    }

    const state = db
      .select()
      .from(materializedServiceFrontendRepoDrizzleSchemas.materializationState)
      .where(
        eq(
          materializedServiceFrontendRepoDrizzleSchemas.materializationState.id,
          1,
        ),
      )
      .get();
    const expectedServiceIndex = (state?.serviceIndex ?? 0) + 1;
    if (command.serviceIndex !== expectedServiceIndex) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-index-gap',
        message: `MaterializedServiceFrontendRepo expected serviceIndex ${expectedServiceIndex}, received ${command.serviceIndex}`,
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
    const boundSourceModelNames = new Set(
      Object.values(frontendBinding.models).map(model => model.modelName),
    );
    const changedResources = [
      ...command.delta.inserted.map(resource => ({
        deleted: false,
        resource,
      })),
      ...command.delta.updated.map(resource => ({
        deleted: false,
        resource,
      })),
      ...command.delta.deleted.map(resource => ({
        deleted: true,
        resource,
      })),
    ];
    const changedKeys = changedResources.map(
      change => `${change.resource.modelName}\u0000${change.resource.id}`,
    );
    if (new Set(changedKeys).size !== changedKeys.length) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-delta-resource-duplicate',
        message: `Service occurrence ${command.serviceIndex} changes one resource more than once`,
      });
    }
    for (const change of changedResources) {
      const sourceModel = yield* getByKeyOrThrow({
        record: service.models,
        key: change.resource.modelName,
        recordKind: `models owned by service ${key.serviceName}`,
      });
      let liveResource: unknown = change.resource;
      if (change.deleted) {
        const { deletedAt: _deletedAt, ...resource } = change.resource;
        liveResource = resource;
      }
      yield* Schema.decodeUnknownEffect(
        Schema.toType(sourceModel.resourceSchema),
      )(liveResource, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'materialized-service-frontend-source-resource-invalid',
          prefix: `Failed to validate ${change.resource.modelName}.${change.resource.id}`,
        }),
      );
    }

    const affected: Array<{
      modelName: string;
      resourceId: string;
      before: IEncodedResourceShape | null;
      after: IEncodedResourceShape | null;
    }> = [];
    for (const change of changedResources) {
      if (!boundSourceModelNames.has(change.resource.modelName)) {
        continue;
      }
      const sourceSchema =
        serviceFrontendRepoSchema[`serviceSource_${change.resource.modelName}`];
      if (sourceSchema === undefined) {
        return yield* new ZerospinError({
          code: 'materialized-service-frontend-source-schema-missing',
          message: `Source schema ${change.resource.modelName} is missing`,
        });
      }
      const beforeRow = db
        .select()
        .from(sourceSchema)
        .where(eq(sourceSchema.id, change.resource.id))
        .get();
      affected.push({
        modelName: change.resource.modelName,
        resourceId: change.resource.id,
        before:
          beforeRow === undefined
            ? null
            : yield* Schema.decodeUnknownEffect(
                Schema.toType(EncodedResourceSchema),
              )(beforeRow).pipe(
                mapParseError({
                  code: 'materialized-service-frontend-before-resource-invalid',
                  prefix: `Failed to decode prior ${change.resource.modelName}.${change.resource.id}`,
                }),
              ),
        after: change.deleted ? null : change.resource,
      });
    }

    db.insert(materializedServiceFrontendRepoDrizzleSchemas.executionClaims)
      .values({
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        canonicalBytes,
        command: canonicalBytes,
        claimedAt: new Date(),
        completedAt: null,
        result: null,
      })
      .run();

    const projection = yield* Effect.gen(function* () {
      const projected: Array<{
        before: IEncodedResourceShape | null;
        after: IEncodedResourceShape | null;
      }> = [];
      for (const change of affected) {
        let before: IEncodedResourceShape | null = null;
        if (change.before !== null) {
          const projectedBefore = yield* projectServiceFrontendResource({
            serviceName: key.serviceName,
            frontendName: key.frontendName,
            modelName: change.modelName,
            resource: change.before,
          });
          before = yield* Schema.decodeUnknownEffect(EncodedResourceSchema)(
            projectedBefore.resource,
          ).pipe(
            mapParseError({
              code: 'materialized-service-frontend-projection-result-invalid',
              prefix: `Failed to decode prior projection ${change.modelName}.${change.resourceId}`,
            }),
          );
        }
        let after: IEncodedResourceShape | null = null;
        if (change.after !== null) {
          const projectedAfter = yield* projectServiceFrontendResource({
            serviceName: key.serviceName,
            frontendName: key.frontendName,
            modelName: change.modelName,
            resource: change.after,
          });
          after = yield* Schema.decodeUnknownEffect(EncodedResourceSchema)(
            projectedAfter.resource,
          ).pipe(
            mapParseError({
              code: 'materialized-service-frontend-projection-result-invalid',
              prefix: `Failed to decode current projection ${change.modelName}.${change.resourceId}`,
            }),
          );
        }
        projected.push({ before, after });
      }
      return projected;
    }).pipe(Effect.result);

    const completedAt = new Date();
    const relevant = affected.length > 0;
    yield* makeTx({
      db,
      program: Effect.fn('MaterializedServiceFrontendRepo.execute.commit')(
        function* ({ tx }) {
          const liveState = tx
            .select()
            .from(
              materializedServiceFrontendRepoDrizzleSchemas.materializationState,
            )
            .where(
              eq(
                materializedServiceFrontendRepoDrizzleSchemas
                  .materializationState.id,
                1,
              ),
            )
            .get();
          if ((liveState?.serviceIndex ?? 0) + 1 !== command.serviceIndex) {
            return yield* new ZerospinError({
              code: 'materialized-service-frontend-state-conflict',
              message: `Service frontier changed before committing ${command.serviceIndex}`,
            });
          }
          tx.run(sql.raw('PRAGMA defer_foreign_keys = ON;'));
          for (const change of changedResources) {
            const sourceSchema =
              serviceFrontendRepoSchema[
                `serviceSource_${change.resource.modelName}`
              ];
            if (sourceSchema === undefined) {
              return yield* new ZerospinError({
                code: 'materialized-service-frontend-source-schema-missing',
                message: `Source schema ${change.resource.modelName} is missing`,
              });
            }
            if (change.deleted) {
              tx.delete(sourceSchema)
                .where(eq(sourceSchema.id, change.resource.id))
                .run();
            } else {
              upsertHelper({
                table: sourceSchema,
                tx,
                values: change.resource,
              });
            }
          }

          const serviceFrontendIndex =
            (liveState?.serviceFrontendIndex ?? 0) + (relevant ? 1 : 0);
          let resultBytes: string | null = null;
          if (relevant) {
            const inserted: IEncodedResourceShape[] = [];
            const updated: IEncodedResourceShape[] = [];
            const deleted: IRef[] = [];
            if (Result.isSuccess(projection)) {
              for (const change of projection.success) {
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
                      code: 'materialized-service-frontend-model-missing',
                      message: `Frontend model ${change.before.modelName} is missing`,
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
                      code: 'materialized-service-frontend-model-missing',
                      message: `Frontend model ${change.after.modelName} is missing`,
                    });
                  }
                  const existed =
                    !identityChanged &&
                    tx
                      .select({ id: afterModel.drizzleSchema.id })
                      .from(afterModel.drizzleSchema)
                      .where(eq(afterModel.drizzleSchema.id, change.after.id))
                      .get() !== undefined;
                  const unchanged =
                    change.before !== null &&
                    !identityChanged &&
                    JSON.stringify(
                      Schema.encodeSync(EncodedResourceSchema)(change.before),
                    ) ===
                      JSON.stringify(
                        Schema.encodeSync(EncodedResourceSchema)(change.after),
                      );
                  upsertHelper({
                    table: afterModel.drizzleSchema,
                    tx,
                    values: change.after,
                  });
                  if (!unchanged) {
                    if (existed) updated.push(change.after);
                    else inserted.push(change.after);
                  }
                }
              }
            }

            const result = yield* Schema.decodeUnknownEffect(
              Schema.toType(ServiceFrontendFinalizedCommandSchema),
            )(
              Result.isFailure(projection)
                ? {
                    ...command,
                    serviceFrontendIndex,
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
                    serviceFrontendIndex,
                    delta: {
                      inserted,
                      updated,
                      deleted,
                      mutations: command.delta.mutations,
                    },
                    failedAt: null,
                    failure: null,
                  },
            ).pipe(
              mapParseError({
                code: 'materialized-service-frontend-terminal-invalid',
                prefix: `Failed to create frontend result ${command.serviceIndex}`,
              }),
            );
            resultBytes = yield* Schema.encodeEffect(
              Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
            )(result).pipe(
              mapParseError({
                code: 'materialized-service-frontend-result-encode-failed',
                prefix: `Failed to encode frontend result ${command.serviceIndex}`,
              }),
            );
            tx.insert(
              materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
            )
              .values({
                serviceFrontendIndex,
                serviceIndex: command.serviceIndex,
                commandId: command.id,
                canonicalBytes: resultBytes,
                command: resultBytes,
                publishedAt: null,
                failure: null,
              })
              .run();
          }

          tx.insert(
            materializedServiceFrontendRepoDrizzleSchemas.materializationState,
          )
            .values({
              id: 1,
              serviceIndex: command.serviceIndex,
              serviceFrontendIndex,
            })
            .onConflictDoUpdate({
              target:
                materializedServiceFrontendRepoDrizzleSchemas
                  .materializationState.id,
              set: {
                serviceIndex: command.serviceIndex,
                serviceFrontendIndex,
              },
            })
            .run();
          tx.update(
            materializedServiceFrontendRepoDrizzleSchemas.executionClaims,
          )
            .set({ completedAt, result: resultBytes })
            .where(
              eq(
                materializedServiceFrontendRepoDrizzleSchemas.executionClaims
                  .serviceIndex,
                command.serviceIndex,
              ),
            )
            .run();
        },
      ),
    });
    if (relevant) {
      yield* Effect.promise(() => props.storage.setAlarm(Date.now()));
    }
  },
);
