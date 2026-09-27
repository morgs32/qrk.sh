import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import {
  ServiceExecutedCommandSchema,
  type ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import {
  encodeFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { runContractGuard } from '@zerospin/core/contracts/runContractGuard';
import type { IAnyMutation } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { runProgram } from '@zerospin/core/execution/runProgram';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type {
  IAnyModels,
  IEncodedDeletedResourceShape,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  type IAnyError,
} from '@zerospin/error';
import type config from 'config';
import { eq } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

/** Commit prepared service commands, resource changes, terminal results, and the execution head together. */
export const executeCommandsTx = makeTx('ServiceVersionRepo.executeCommandsTx')(
  function* (
    tx: ITx<
      IResourceDbConfig<IAnyModels, typeof serviceVersionRepoDbConfig.tables>
    >,
    props: {
      cursor: number;
      inputs: readonly {
        command: typeof ServiceChainedCommandSchema.Type;
        prepared: Result.Result<
          {
            payload: unknown;
            mutations: readonly IAnyMutation[];
          },
          IFailure
        >;
        startedAt: Date;
      }[];
      service: (typeof config.system.services)[string][string];
      key: { systemId: string; serviceName: string; serviceVersion: string };
    },
  ) {
    const { cursor, inputs, service, key } = props;

    const live = tx
      .select()
      .from(serviceVersionRepoDbConfig.schema.head)
      .where(eq(serviceVersionRepoDbConfig.schema.head.singletonId, 1))
      .get();
    if ((live?.serviceIndex ?? 0) !== cursor) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-execution-head-conflict',
          message: 'Execution head changed while preparing',
        }),
      );
    }
    let dispositionHash = live?.dispositionHash ?? genesisDispositionHash();
    for (const { command, prepared, startedAt } of inputs) {
      const beforeByResource = new Map<
        string,
        IEncodedResourceShape | undefined
      >();
      const modelNameByResource = new Map<string, string>();
      const resourceIdByResource = new Map<string, string>();
      let guardFailure: IFailure | null = null;
      if (
        command.admission.status === 'succeeded' &&
        Result.isSuccess(prepared)
      ) {
        const contract = Object.values(service.contracts).find(
          candidate => candidate.commandName === command.commandName,
        );
        if (contract !== undefined) {
          const guarded = yield* runContractGuard({
            contract,
            queryDb: tx,
            payload: prepared.success.payload,
            claims: null,
          }).pipe(
            runProgram,
            Effect.catch(failure =>
              encodeFailure(contract, failure).pipe(
                Effect.flatMap(Effect.fail),
              ),
            ),
            Effect.result,
          );
          if (Result.isFailure(guarded)) {
            if (!('scope' in guarded.failure)) {
              return yield* Effect.fail(makeZerospinError(guarded.failure));
            }
            guardFailure = yield* Schema.decodeUnknownEffect(
              PublicFailureSchema,
            )(guarded.failure).pipe(
              mapParseError({
                code: 'command-failure-invalid',
                prefix: 'Invalid failure',
              }),
            );
          }
        }
      }
      const applied: Result.Result<void, IFailure | IAnyError> =
        command.admission.status === 'failed'
          ? Result.succeed(undefined)
          : guardFailure !== null
            ? Result.fail(guardFailure)
            : Result.isFailure(prepared)
              ? Result.fail(prepared.failure)
              : yield* withSavepoint({
                  tx,
                  program: Effect.fn('ServiceVersionRepo.execute.command')(
                    function* ({ tx: commandTx }) {
                      for (const [
                        mutationIndex,
                        mutation,
                      ] of prepared.success.mutations.entries()) {
                        if (mutation.operationName === 'replicate') {
                          return yield* Effect.fail(
                            makeZerospinError({
                              code: 'service-contract-cannot-replicate-resource',
                              message: `Service contract ${command.commandName} cannot emit replicate`,
                            }),
                          );
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
                                    code: 'service-before-resource-invalid',
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
                        const appliedMutation = yield* applyMutationTx({
                          tx: commandTx,
                          mutation,
                          commandId: command.id,
                          mutationIndex,
                          appliedAt: startedAt,
                        });
                        const encoded = yield* encodeAppliedMutation({
                          mutation: appliedMutation,
                        });
                        const bytes =
                          yield* serviceVersionRepoDbConfig.tables.mutations
                            .encodeRow({
                              ...encoded,
                              id: `${command.serviceIndex}/${mutationIndex}`,
                              serviceIndex: command.serviceIndex,
                            })
                            .pipe(
                              mapParseError({
                                code: 'mutation-row-encode-failed',
                                prefix: 'Invalid applied mutation',
                              }),
                            );
                        commandTx
                          .insert(serviceVersionRepoDbConfig.schema.mutations)
                          .values(bytes)
                          .run();
                      }
                    },
                  ),
                }).pipe(Effect.result);

      if (
        Result.isFailure(applied) &&
        applied.failure !== guardFailure &&
        !(Result.isFailure(prepared) && applied.failure === prepared.failure) &&
        ![
          'mutation-row-not-found',
          'mutation-referential-integrity-failed',
          'service-contract-cannot-replicate-resource',
        ].includes(isZerospinError(applied.failure) ? applied.failure.code : '')
      ) {
        return yield* Effect.fail(
          isZerospinError(applied.failure)
            ? applied.failure
            : makeZerospinError('unexpected-business-failure'),
        );
      }

      // 9 — compare touched resources only after successful mutation application
      const executionFailure = Result.isFailure(applied)
        ? yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
            'cause' in applied.failure
              ? yield* encodeError(applied.failure)
              : applied.failure,
          ).pipe(
            mapParseError({
              code: 'command-failure-invalid',
              prefix: 'Invalid failure',
            }),
          )
        : null;
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
            return yield* Effect.fail(
              makeZerospinError({
                code: 'service-delta-metadata-missing',
                message: `Service delta metadata is missing for ${resourceKey}`,
              }),
            );
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
                updatedAt: startedAt,
                deletedAt: startedAt,
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
        failure:
          command.admission.status === 'failed'
            ? command.admission.failure
            : executionFailure,
        previousDispositionHash: dispositionHash,
        serviceIndex: command.serviceIndex,
        commandId: command.id,
        disposition:
          command.admission.status === 'failed' || Result.isFailure(applied)
            ? 'failure'
            : 'success',
      });

      // 10 — encode success mutations or an empty delta with the settled failure
      const terminal = yield* Schema.decodeUnknownEffect(
        Schema.toType(ServiceExecutedCommandSchema),
      )({
        ...command,
        dispositionHash,
        execution:
          command.admission.status === 'failed'
            ? { status: 'skipped', reason: 'admission-failed' }
            : executionFailure === null
              ? {
                  status: 'succeeded',
                  startedAt,
                  completedAt: new Date(),
                  executionDelta: { inserted, updated, deleted },
                }
              : {
                  status: 'failed',
                  startedAt,
                  completedAt: new Date(),
                  failure: executionFailure,
                },
      }).pipe(
        mapParseError({
          code: 'service-terminal-command-invalid',
          prefix: `Failed to create service result ${command.serviceIndex}`,
        }),
      );

      const bytes = yield* serviceVersionRepoDbConfig.tables.commands
        .encodeRow({
          ...terminal,
          executionVersion: key.serviceVersion,
          acknowledgedAt: null,
          lastDeliveryFailure: null,
        })
        .pipe(
          mapParseError({
            code: 'service-result-encode-failed',
            prefix: 'Invalid service executed command',
          }),
        );
      tx.insert(serviceVersionRepoDbConfig.schema.commands).values(bytes).run();
      tx.insert(serviceVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          serviceIndex: command.serviceIndex,
          dispositionHash,
        })
        .onConflictDoUpdate({
          target: serviceVersionRepoDbConfig.schema.head.singletonId,
          set: {
            serviceIndex: command.serviceIndex,
            dispositionHash,
          },
        })
        .run();
    }
  },
);
