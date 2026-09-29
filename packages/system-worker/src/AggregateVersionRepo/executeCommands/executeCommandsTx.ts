import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import { assertMutationsUseModels } from '@zerospin/core/contracts/assertMutationsUseModels';
import {
  AggregateExecutedCommandSchema,
  type AggregateChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  encodeMutation,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import {
  encodeFailure,
  type IFailure,
} from '@zerospin/core/contracts/failureCodec';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/prepareReplayAppliedMutation';
import type {
  IAnyMutation,
  IContract,
  IEncodedMutation,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
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
import { mapValues } from 'es-toolkit';

import { advanceDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

/** Atomically commit one prepared command and its version-owned result.
 * Domain rejection retains a failed terminal record without resource changes.
 *
 * 1. Apply the already checked program mutations in their returned order.
 * 2. Separate domain rejection from infrastructure failure.
 * 3. Commit terminal history with resource state.
 */
export const executeCommandsTx = makeTx(
  'AggregateVersionRepo.executeCommandsTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof aggregateVersionRepoDbConfig.tables>
  >,
  props: {
    head:
      | typeof aggregateVersionRepoDbConfig.schema.head.$inferSelect
      | undefined;
    preparedPage: readonly {
      command: typeof AggregateChainedCommandSchema.Type;
      startedAt: Date;
      mutations: readonly IEncodedMutation[];
      failure: IFailure | null;
      contract: IContract | null;
      payload: unknown;
      guard: (
        db: Readonly<Pick<IDb, 'query'>>,
      ) => Effect.Effect<void, IFailure | IAnyError, unknown>;
    }[];
    aggregate: (typeof config.system.aggregates)[string][string];
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: string;
    };
  },
) {
  const { head, preparedPage, aggregate, key } = props;

  // 1 — apply prepared mutations in program result order

  if (!head) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-head-missing',
        message:
          'VAR activation must initialize the original aggregate spec before execution',
      }),
    );
  }
  let dispositionHash = head.dispositionHash;
  let cursor = head.aggregateIndex;
  let executedIndex = head.executedIndex;
  for (const prepared of preparedPage) {
    const { command, startedAt } = prepared;
    if (command.aggregateIndex !== cursor + 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-execution-gap',
          message: 'Admitted history is not contiguous',
        }),
      );
    }
    let authoredRejection: IFailure | null = prepared.failure;
    const before = new Map<
      string,
      {
        modelName: string;
        resourceId: string;
        resource: IEncodedResourceShape | undefined;
      }
    >();
    for (const mutation of prepared.mutations) {
      const model = aggregate.models[mutation.modelName];
      if (model === undefined) {
        return yield* Effect.fail(
          makeZerospinError('aggregate-delta-model-missing'),
        );
      }
      const identity = `${mutation.modelName}\0${mutation.resourceId}`;
      if (before.has(identity)) continue;
      const row = tx
        .select()
        .from(model.drizzleSchema)
        .where(eq(model.drizzleSchema.id, mutation.resourceId))
        .get();
      before.set(identity, {
        modelName: mutation.modelName,
        resourceId: mutation.resourceId,
        resource:
          row === undefined
            ? undefined
            : yield* Schema.decodeUnknownEffect(
                Schema.toType(EncodedResourceSchema),
              )(row).pipe(
                mapParseError({
                  code: 'aggregate-delta-invalid',
                  prefix: 'Invalid preceding resource',
                }),
              ),
      });
    }

    const applied =
      command.admission.status === 'failed'
        ? Result.succeed(undefined)
        : authoredRejection !== null
          ? Result.fail(authoredRejection)
          : yield* withSavepoint({
              tx,
              program: ({ tx: commandTx }) =>
                Effect.gen(function* () {
                  yield* prepared.guard(commandTx).pipe(
                    Effect.tapError(failure =>
                      Effect.sync(() => {
                        if ('scope' in failure) {
                          authoredRejection = failure;
                        }
                      }),
                    ),
                  );
                  const applyAndStore = (
                    mutation: IAnyMutation,
                    mutationIndex: number,
                  ) =>
                    Effect.gen(function* () {
                      const appliedMutation = yield* applyAggregateMutationTx({
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
                        yield* aggregateVersionRepoDbConfig.tables.mutations
                          .encodeRow({
                            ...encoded,
                            id: `${executedIndex + 1}/${mutationIndex}`,
                            executedIndex: executedIndex + 1,
                          })
                          .pipe(
                            mapParseError({
                              code: 'mutation-row-encode-failed',
                              prefix: 'Invalid applied mutation',
                            }),
                          );
                      commandTx
                        .insert(aggregateVersionRepoDbConfig.schema.mutations)
                        .values(bytes)
                        .run();
                    });
                  // Preserve program order, including replicas; dependency failures roll back this savepoint.
                  for (const mutation of prepared.mutations) {
                    const decodedMutation = yield* prepareReplayAppliedMutation(
                      {
                        mutation,
                        controller: aggregate,
                      },
                    );
                    if (decodedMutation.operationName !== 'replicate') {
                      yield* applyAndStore(
                        decodedMutation,
                        mutation.mutationIndex,
                      );
                      continue;
                    }
                    const { serviceName, serviceVersion, serviceIndex } =
                      decodedMutation.operation;
                    if (
                      serviceVersion === undefined ||
                      serviceIndex === undefined ||
                      !Number.isSafeInteger(serviceIndex) ||
                      serviceIndex < 0 ||
                      aggregate.services[serviceName] !== serviceVersion
                    ) {
                      return yield* Effect.fail(
                        makeZerospinError({
                          code: 'replica-source-invalid',
                          message:
                            'Replication requires the pinned service version and a valid source position',
                        }),
                      );
                    }
                    const source = commandTx
                      .select()
                      .from(aggregateVersionRepoDbConfig.schema.services)
                      .where(
                        eq(
                          aggregateVersionRepoDbConfig.schema.services
                            .serviceName,
                          serviceName,
                        ),
                      )
                      .get();
                    if (
                      source === undefined ||
                      aggregate.services[serviceName] !== serviceVersion
                    ) {
                      return yield* Effect.fail(
                        makeZerospinError({
                          code: 'replica-source-invalid',
                          message:
                            'Replication requires an activation-declared service source',
                        }),
                      );
                    }
                    const current = commandTx
                      .select()
                      .from(decodedMutation.model.drizzleSchema)
                      .where(
                        eq(
                          decodedMutation.model.drizzleSchema.id,
                          decodedMutation.resourceId,
                        ),
                      )
                      .get();
                    const enrolled =
                      current === undefined
                        ? undefined
                        : yield* Schema.decodeUnknownEffect(
                            Schema.Struct({ serviceIndex: Schema.Number }),
                          )(current).pipe(
                            mapParseError({
                              code: 'replica-resource-invalid',
                              prefix: 'Invalid retained replica position',
                            }),
                          );
                    const effectiveIndex =
                      enrolled === undefined
                        ? serviceIndex
                        : Math.max(enrolled.serviceIndex, source.lastIndex);
                    if (
                      current !== undefined &&
                      effectiveIndex >= serviceIndex
                    ) {
                      yield* Schema.encodeEffect(
                        decodedMutation.model.resourceSchema,
                      )(current).pipe(
                        mapParseError({
                          code: 'replica-resource-invalid',
                          prefix: 'Invalid retained replica copy',
                        }),
                      );
                    } else {
                      yield* applyAndStore(
                        decodedMutation,
                        mutation.mutationIndex,
                      );
                    }
                  }
                  const extension = aggregate.extensions[command.commandName];
                  if (extension !== undefined && prepared.contract !== null) {
                    const contract = prepared.contract;
                    const extensionMutations = yield* runProgram(
                      extension({
                        db: commandTx,
                        models: mapValues(aggregate.models, makeModelMutations),
                        payload: prepared.payload,
                        failures: contract.failures,
                      }),
                    ).pipe(
                      Effect.catch(failure =>
                        typeof failure === 'object' &&
                        failure !== null &&
                        'scope' in failure &&
                        failure.scope === 'aggregate'
                          ? encodeFailure(contract, failure).pipe(
                              Effect.flatMap(encoded => {
                                authoredRejection = encoded;
                                return Effect.fail(encoded);
                              }),
                            )
                          : Effect.fail(failure),
                      ),
                    );
                    if (!Array.isArray(extensionMutations)) {
                      return yield* Effect.fail(
                        makeZerospinError('aggregate-extension-result-invalid'),
                      );
                    }
                    yield* assertMutationsUseModels({
                      mutations: extensionMutations,
                      models: aggregate.models,
                      commandName: command.commandName,
                    });
                    const nextMutationIndex = prepared.mutations.reduce(
                      (next, mutation) =>
                        Math.max(next, mutation.mutationIndex + 1),
                      0,
                    );
                    for (const [
                      offset,
                      mutation,
                    ] of extensionMutations.entries()) {
                      if (mutation.operationName === 'replicate') {
                        return yield* Effect.fail(
                          makeZerospinError(
                            'aggregate-extension-replication-unsupported',
                          ),
                        );
                      }
                      const mutationIndex = nextMutationIndex + offset;
                      const encodedMutation = yield* encodeMutation({
                        commandId: command.id,
                        mutationIndex,
                        mutation,
                      });
                      const identity = `${encodedMutation.modelName}\0${encodedMutation.resourceId}`;
                      if (!before.has(identity)) {
                        const model =
                          aggregate.models[encodedMutation.modelName];
                        if (model === undefined) {
                          return yield* Effect.fail(
                            makeZerospinError('aggregate-delta-model-missing'),
                          );
                        }
                        const row = commandTx
                          .select()
                          .from(model.drizzleSchema)
                          .where(
                            eq(
                              model.drizzleSchema.id,
                              encodedMutation.resourceId,
                            ),
                          )
                          .get();
                        before.set(identity, {
                          modelName: encodedMutation.modelName,
                          resourceId: encodedMutation.resourceId,
                          resource:
                            row === undefined
                              ? undefined
                              : yield* Schema.decodeUnknownEffect(
                                  Schema.toType(EncodedResourceSchema),
                                )(row).pipe(
                                  mapParseError({
                                    code: 'aggregate-delta-invalid',
                                    prefix: 'Invalid preceding resource',
                                  }),
                                ),
                        });
                      }
                      const decodedMutation =
                        yield* prepareReplayAppliedMutation({
                          mutation: encodedMutation,
                          controller: aggregate,
                        });
                      yield* applyAndStore(decodedMutation, mutationIndex);
                    }
                  }
                }),
            }).pipe(Effect.result);

    // 2 — advance known command failures after savepoint rollback; abort other failures
    if (
      Result.isFailure(applied) &&
      applied.failure !== authoredRejection &&
      ![
        'mutation-row-not-found',
        'mutation-referential-integrity-failed',
        'service-resource-deleted',
      ].includes(isZerospinError(applied.failure) ? applied.failure.code : '')
    ) {
      return yield* Effect.fail(
        isZerospinError(applied.failure)
          ? applied.failure
          : makeZerospinError('unexpected-business-failure'),
      );
    }

    const executionFailure = Result.isFailure(applied)
      ? yield* Schema.decodeUnknownEffect(PublicFailureSchema)(
          isZerospinError(applied.failure) && 'cause' in applied.failure
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
      for (const {
        modelName,
        resourceId,
        resource: previous,
      } of before.values()) {
        const model = aggregate.models[modelName];
        if (model === undefined) {
          return yield* Effect.fail(
            makeZerospinError('aggregate-delta-model-missing'),
          );
        }
        const row = tx
          .select()
          .from(model.drizzleSchema)
          .where(eq(model.drizzleSchema.id, resourceId))
          .get();
        if (row === undefined) {
          if (previous !== undefined) {
            deleted.push({
              ...previous,
              updatedAt: startedAt,
              deletedAt: startedAt,
            });
          }
          continue;
        }
        const resource = yield* Schema.decodeUnknownEffect(
          Schema.toType(EncodedResourceSchema),
        )(row).pipe(
          mapParseError({
            code: 'aggregate-delta-invalid',
            prefix: 'Invalid resulting resource',
          }),
        );
        // Include existing replica copies too: downstream selection may be enrolling them for the first time.
        if (previous === undefined) inserted.push(resource);
        else updated.push(resource);
      }
    }

    // 3 — advance the disposition hash and write commands outbox plus head in the page transaction
    dispositionHash = advanceDispositionHash({
      failure:
        command.admission.status === 'failed'
          ? command.admission.failure
          : executionFailure,
      previousDispositionHash: dispositionHash,
      aggregateIndex: command.aggregateIndex,
      commandId: command.id,
      disposition:
        command.admission.status === 'failed' || Result.isFailure(applied)
          ? 'failure'
          : 'success',
    });
    const terminal = yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateExecutedCommandSchema),
    )({
      ...command,
      execution:
        command.admission.status === 'failed'
          ? { status: 'skipped', reason: 'admission-failed' }
          : executionFailure !== null
            ? {
                status: 'failed',
                startedAt,
                completedAt: new Date(),
                failure: executionFailure,
              }
            : {
                status: 'succeeded',
                startedAt,
                completedAt: new Date(),
                executionDelta: { inserted, updated, deleted },
              },
      dispositionHash,
    }).pipe(
      mapParseError({
        code: 'aggregate-terminal-invalid',
        prefix: 'Invalid terminal occurrence',
      }),
    );
    const bytes = yield* aggregateVersionRepoDbConfig.tables.aggregateCommands
      .encodeRow({
        ...terminal,
        aggregateVersion:
          'aggregateVersion' in terminal ? terminal.aggregateVersion : null,
        executedIndex: ++executedIndex,
        executionVersion: key.aggregateVersion,
        acknowledgedAt: null,
        lastDeliveryFailure: null,
      })
      .pipe(
        mapParseError({
          code: 'aggregate-terminal-encode-failed',
          prefix: 'Failed to encode terminal result',
        }),
      );
    tx.insert(aggregateVersionRepoDbConfig.schema.aggregateCommands)
      .values(bytes)
      .run();
    tx.update(aggregateVersionRepoDbConfig.schema.head)
      .set({
        aggregateIndex: command.aggregateIndex,
        executedIndex,
        dispositionHash,
      })
      .where(eq(aggregateVersionRepoDbConfig.schema.head.singletonId, 1))
      .run();
    cursor = command.aggregateIndex;
  }
});
