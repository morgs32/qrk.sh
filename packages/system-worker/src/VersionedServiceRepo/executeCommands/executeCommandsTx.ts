import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import {
  ServiceChainedCommandSchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  type encodeMutation,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAnyMutation,
  IAppliedMutation,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { initializeGuards } from '@zerospin/core/guards/initializeGuards';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IEncodedDeletedResourceShape,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { type system } from 'system';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import {
  VersionedServiceRepoDb,
  versionedServiceRepoDbConfig,
} from '../versionedServiceRepoDbConfig.js';

/** Commit prepared service commands, resource changes, terminal results, and the execution head together. */
export const executeCommandsTx = makeTx(
  'VersionedServiceRepo.executeCommandsTx',
  VersionedServiceRepoDb,
)(function* (props: {
  cursor: number;
  inputs: readonly {
    command: typeof ServiceChainedCommandSchema.Type;
    prepared: Result.Result<
      { payload: unknown; mutations: readonly IAnyMutation[] },
      IAnyError
    >;
    mutations: readonly Effect.Success<ReturnType<typeof encodeMutation>>[];
    now: Date;
    sourceCommand: string;
  }[];
  service: (typeof system.services)[string][string];
  guards: Effect.Success<
    ReturnType<typeof initializeGuards<never, unknown, unknown>>
  >;
  key: { systemId: string; serviceName: string; serviceVersion: string };
}) {
  const { cursor, inputs, service, guards, key } = props;

  const tx = yield* VersionedServiceRepoDb.Tx;
  const live = tx
    .select()
    .from(versionedServiceRepoDbConfig.schema.head)
    .where(eq(versionedServiceRepoDbConfig.schema.head.singletonId, 1))
    .get();
  if ((live?.serviceIndex ?? 0) !== cursor) {
    return yield* new ZerospinError({
      code: 'service-execution-head-conflict',
      message: 'Execution head changed while preparing',
    });
  }
  let dispositionHash = live?.dispositionHash ?? genesisDispositionHash();
  for (const { command, prepared, mutations, now, sourceCommand } of inputs) {
    const beforeByResource = new Map<
      string,
      IEncodedResourceShape | undefined
    >();
    const modelNameByResource = new Map<string, string>();
    const resourceIdByResource = new Map<string, string>();
    const appliedMutations: IAppliedMutation[] = [];
    let authoredRejection: IAnyError | undefined;
    const applied = Result.isFailure(prepared)
      ? Result.fail(prepared.failure)
      : yield* withSavepoint({
          tx,
          program: Effect.fn('VersionedServiceRepo.execute.command')(
            function* ({ tx: commandTx }) {
              const contract = service.contracts[command.commandName];
              if (contract?.guard !== undefined) {
                const payload = prepared.success.payload;
                yield* guards
                  .run(command.commandName, {
                    db: commandTx,
                    userId: null,
                    payload,
                  })
                  .pipe(
                    Effect.tapError(error =>
                      Effect.sync(() => {
                        if (error.code !== 'guard-must-be-synchronous') {
                          authoredRejection = error;
                        }
                      }),
                    ),
                  );
              }
              for (const [
                mutationIndex,
                mutation,
              ] of prepared.success.mutations.entries()) {
                if (mutation.operationName === 'replicate') {
                  return yield* new ZerospinError({
                    code: 'service-contract-cannot-replicate-resource',
                    message: `Service contract ${command.commandName} cannot emit replicate`,
                  });
                }
                const resourceKey = `${mutation.model.modelName}\u0000${mutation.resourceId}`;
                if (!beforeByResource.has(resourceKey)) {
                  const beforeRow = commandTx
                    .select()
                    .from(mutation.model.drizzleSchema)
                    .where(
                      eq(mutation.model.drizzleSchema.id, mutation.resourceId),
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
                            code: 'service-before-resource-invalid',
                            prefix: `Failed to decode ${mutation.model.modelName}.${mutation.resourceId}`,
                          }),
                        ),
                  );
                }
                modelNameByResource.set(resourceKey, mutation.model.modelName);
                resourceIdByResource.set(resourceKey, mutation.resourceId);
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

    if (
      Result.isFailure(applied) &&
      applied.failure !== authoredRejection &&
      !(Result.isFailure(prepared) && applied.failure === prepared.failure) &&
      ![
        'mutation-row-not-found',
        'mutation-referential-integrity-failed',
        'service-contract-cannot-replicate-resource',
      ].includes(applied.failure.code)
    ) {
      return yield* applied.failure;
    }

    // 9 — compare touched resources only after successful mutation application
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
            code: 'service-delta-metadata-missing',
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
            deleted.push({
              ...before,
              updatedAt: now,
              deletedAt: now,
            });
          }
          continue;
        }
        const after = yield* Schema.decodeUnknownEffect(
          Schema.toType(EncodedResourceSchema),
        )(afterRow).pipe(
          mapParseError({
            code: 'service-after-resource-invalid',
            prefix: `Failed to decode ${modelName}.${resourceId}`,
          }),
        );
        if (before === undefined) {
          inserted.push(after);
        } else if (
          JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(before)) !==
          JSON.stringify(Schema.encodeSync(EncodedResourceSchema)(after))
        ) {
          updated.push(after);
        }
      }
    }
    dispositionHash = advanceDispositionHash({
      previousDispositionHash: dispositionHash,
      serviceIndex: command.serviceIndex,
      commandId: command.id,
      disposition: Result.isFailure(applied) ? 'failure' : 'success',
    });

    // 10 — encode success mutations or an empty delta with the settled failure
    const terminal = yield* Schema.decodeUnknownEffect(
      Schema.toType(ServiceChainedCommandSchema),
    )(
      Result.isFailure(applied)
        ? {
            ...command,
            dispositionHash,
            delta: {
              inserted: [],
              updated: [],
              deleted: [],
              mutations: [],
            },
            failedAt: now,
            failure: Schema.encodeSync(ZerospinError.schema)(applied.failure),
          }
        : {
            ...command,
            dispositionHash,
            delta: {
              inserted,
              updated,
              deleted,
              mutations: yield* Effect.forEach(appliedMutations, mutation =>
                encodeAppliedMutation({ mutation }),
              ),
            },
            failedAt: null,
            failure: null,
          },
    ).pipe(
      mapParseError({
        code: 'service-terminal-command-invalid',
        prefix: `Failed to create service result ${command.serviceIndex}`,
      }),
    );

    const bytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(ServiceExecutionEntrySchema),
    )({
      sourceCommand,
      command: terminal,
      mutations,
      preparationVersion: key.serviceVersion,
      executionTimestamp: now,
    }).pipe(
      mapParseError({
        code: 'service-result-encode-failed',
        prefix: 'Invalid service execution entry',
      }),
    );
    tx.insert(versionedServiceRepoDbConfig.schema.results)
      .values({
        outboxIndex: command.serviceIndex,
        entry: bytes,
        executionVersion: key.serviceVersion,
        deliveredAt: null,
        lastDeliveryFailure: null,
      })
      .run();
    tx.insert(versionedServiceRepoDbConfig.schema.head)
      .values({
        singletonId: 1,
        serviceIndex: command.serviceIndex,
        dispositionHash,
      })
      .onConflictDoUpdate({
        target: versionedServiceRepoDbConfig.schema.head.singletonId,
        set: {
          serviceIndex: command.serviceIndex,
          dispositionHash,
        },
      })
      .run();
  }
});
