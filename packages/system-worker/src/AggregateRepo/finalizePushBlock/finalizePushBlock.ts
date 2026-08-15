/*
 * System-worker annotation:
 * Finalizes one immutable AggregateFrontendRepo pushed block into authoritative aggregate
 * outcomes. Full encoded frontend commands remain intact in the block ledger.
 */

import type { Async } from '@zerospin/core/async/Async';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import {
  ExecutedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
  PushBlockSchema,
  PushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAggregateCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedStagedReplicaCommand,
  IFailedPushedCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import {
  getLastAggregateCursor,
  getLastAggregateIndex,
  setLastAggregateCursor,
  setLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import type { IAggregateBlockOutboxRecord } from '../../types.js';
import { adaptAggregateFrontendCommand } from '../adaptAggregateFrontendCommand/adaptAggregateFrontendCommand.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';
import { makeAggregateBlockTx } from '../finalizeAggregateCommands/makeAggregateBlockTx.js';
import { prepareAggregateCommands } from '../finalizeAggregateCommands/prepareAggregateCommands.js';
import { upsertAggregateBlockTx } from '../finalizeAggregateCommands/upsertAggregateBlockTx.js';
import { runAggregateFrontendGuards } from '../runAggregateFrontendGuards/runAggregateFrontendGuards.js';

/*
 * 1. Validate pushed-block scope and return immutable prior outcomes.
 * 2. Adapt every valid pushed command while preserving original positions.
 * 3. Prepare all adapted aggregate commands in one grouped replication batch.
 * 4. Read the aggregate frontier and apply retained ServiceBlocks before snapshots join.
 * 5. Commit ordered commandless AggregateBlocks and service watermarks at W.
 * 6. Choose one trusted or revalidated guard mode from the post-alignment cursor.
 * 7. Revalidate when required and finalize each command in its existing savepoint.
 * 8. Persist one final pushed AggregateBlock after every intermediate block.
 */
export const finalizePushBlock = Effect.fn('AggregateRepo.finalizePushBlock')(
  function* (props: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    pushBlock: IPushBlock;
    db: IDb;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    void,
    IAnyError,
    Async | CuidFactory | MonotonicFactory
  > {
    const { generationId, aggregateId, aggregateName, pushBlock, db, storage } =
      props;

    yield* Schema.validate(PushBlockSchema)(pushBlock).pipe(
      mapParseError({
        code: 'aggregate-push-block-invalid',
        prefix: 'Failed to validate AggregateRepo PushBlock input',
      }),
    );
    const requestedCommands = [
      ...pushBlock.pushedCommands,
      ...pushBlock.failedStagedCommands,
    ];
    // 1 — reject scope mismatches before command adaptation or mutation.
    for (const pushedCommand of requestedCommands) {
      if (
        pushedCommand.aggregateId !== aggregateId ||
        pushedCommand.aggregateName !== aggregateName
      ) {
        return yield* new ZerospinError({
          code: 'pushed-command-aggregate-scope-mismatch',
          message: `Pushed command "${pushedCommand.id}" does not belong to AggregateRepo ${aggregateId}/${aggregateName}`,
        });
      }
    }

    if (requestedCommands.length === 0) return;

    const commandBytesById = new Map<string, string>();
    const unseenPushedCommands: IEncodedCommand<IPushedCommand>[] = [];
    const unseenFailedStagedCommands: IEncodedCommand<IFailedStagedReplicaCommand>[] =
      [];
    for (const command of requestedCommands) {
      const commandBytes =
        command.status === 'pushed'
          ? yield* Schema.encode(Schema.parseJson(PushedCommandSchema))(
              command,
            ).pipe(
              mapParseError({
                code: 'aggregate-push-command-comparison-encode-failed',
                prefix: `Failed to encode pushed command ${command.id} for exact comparison`,
              }),
            )
          : yield* Schema.encode(
              Schema.parseJson(FailedStagedReplicaCommandSchema),
            )(command).pipe(
              mapParseError({
                code: 'aggregate-failed-staged-comparison-encode-failed',
                prefix: `Failed to encode failed-staged command ${command.id} for exact comparison`,
              }),
            );
      const repeatedBytes = commandBytesById.get(command.id);
      if (repeatedBytes !== undefined && repeatedBytes !== commandBytes) {
        return yield* new ZerospinError({
          code: 'aggregate-command-outcome-conflict',
          message: `PushBlock command ${command.id} appears with conflicting bytes`,
        });
      }
      commandBytesById.set(command.id, commandBytes);
      const retained = db
        .select()
        .from(aggregateRepoDrizzleSchemas.aggregateCommandOutcomes)
        .where(
          eq(
            aggregateRepoDrizzleSchemas.aggregateCommandOutcomes.commandId,
            command.id,
          ),
        )
        .get();
      if (retained !== undefined) {
        if (retained.commandBytes !== commandBytes) {
          return yield* new ZerospinError({
            code: 'aggregate-command-outcome-conflict',
            message: `PushBlock command ${command.id} conflicts with its retained terminal outcome`,
          });
        }
        continue;
      }
      if (command.status === 'pushed') {
        unseenPushedCommands.push(command);
      } else if (!('aggregateIndex' in command)) {
        unseenFailedStagedCommands.push(command);
      }
    }
    if (
      unseenPushedCommands.length === 0 &&
      unseenFailedStagedCommands.length === 0
    ) {
      return;
    }

    // 2 — adapter failures stay at their original pushed-command positions
    const adaptedCommands: Array<{
      pushedCommand: IEncodedCommand<IPushedCommand>;
      aggregateCommand: Either.Either<
        IEncodedCommand<IAggregateCommand>,
        IAnyError
      >;
    }> = [];

    for (const pushedCommand of unseenPushedCommands) {
      const aggregateCommand = yield* adaptAggregateFrontendCommand({
        command: pushedCommand,
      }).pipe(
        Effect.flatMap(aggregateCommand => {
          if (
            aggregateCommand.id !== pushedCommand.id ||
            aggregateCommand.commandType !== 'aggregate' ||
            aggregateCommand.aggregateId !== pushedCommand.aggregateId ||
            aggregateCommand.aggregateName !== pushedCommand.aggregateName ||
            aggregateCommand.systemName !== pushedCommand.systemName ||
            aggregateCommand.sessionId !== pushedCommand.sessionId ||
            aggregateCommand.userId !== pushedCommand.userId ||
            aggregateCommand.frontendName !== pushedCommand.frontendName ||
            aggregateCommand.pushedCursor !== pushedCommand.pushedCursor
          ) {
            return Effect.fail(
              new ZerospinError({
                code: 'system-runtime-adapted-aggregate-command-provenance-mismatch',
                message: `Dynamic frontend adapter changed immutable provenance for pushed command "${pushedCommand.id}"`,
              }),
            );
          }
          return Effect.succeed(aggregateCommand);
        }),
        Effect.either,
      );

      adaptedCommands.push({ pushedCommand, aggregateCommand });
    }

    // 3 — collect all successful adapters, then call prepareAggregateCommands exactly once
    const aggregateCommands: IEncodedCommand<IAggregateCommand>[] = [];
    for (const adaptedCommand of adaptedCommands) {
      if (Either.isRight(adaptedCommand.aggregateCommand)) {
        aggregateCommands.push(adaptedCommand.aggregateCommand.right);
      }
    }
    const batchedPreparation = yield* prepareAggregateCommands({
      generationId,
      aggregateName,
      commands: aggregateCommands,
      db,
    });
    const preparedCommands: Array<{
      pushedCommand: IEncodedCommand<IPushedCommand>;
      preparation: Effect.Effect.Success<
        ReturnType<typeof prepareAggregateCommands>
      >['preparedCommands'][number]['mutations'];
    }> = [];
    let preparedAggregateCommandIndex = 0;
    for (const adaptedCommand of adaptedCommands) {
      if (Either.isLeft(adaptedCommand.aggregateCommand)) {
        preparedCommands.push({
          pushedCommand: adaptedCommand.pushedCommand,
          preparation: Either.left(adaptedCommand.aggregateCommand.left),
        });
        continue;
      }
      const preparedAggregateCommand =
        batchedPreparation.preparedCommands[preparedAggregateCommandIndex];
      preparedAggregateCommandIndex += 1;
      preparedCommands.push({
        pushedCommand: adaptedCommand.pushedCommand,
        preparation:
          preparedAggregateCommand?.mutations ??
          Either.left(
            new ZerospinError({
              code: 'pushed-command-preparation-missing',
              message: `AggregateRepo did not prepare pushed command "${adaptedCommand.pushedCommand.id}"`,
            }),
          ),
      });
    }

    const aggregate = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: aggregateName,
      recordKind: 'aggregates',
    });
    return yield* makeAsyncTx({
      storage,
      program: Effect.fn('AggregateRepo.finalizePushBlock.transaction')(
        function* () {
          const alignment = yield* makeTx({
            db,
            program: Effect.fn('AggregateRepo.finalizePushBlock.alignServices')(
              function* ({ tx }) {
                let currentAggregateIndex = yield* getLastAggregateIndex({
                  storage,
                  defaultValue: 0,
                });
                let currentLastAggregateCursor =
                  (yield* getLastAggregateCursor({ storage })) ?? null;

                // 4 — start at the persisted aggregate frontier, then align old members from C through W
                for (const serviceAlignment of batchedPreparation.serviceAlignments) {
                  const persistedServiceRepoName = yield* Schema.decodeUnknown(
                    makeAbbreviationIdSchema(
                      systemWorkerAbbreviations.serviceRepo,
                    ),
                  )(serviceAlignment.serviceRepoName).pipe(
                    mapParseError({
                      code: 'aggregate-service-repo-name-decode-failed',
                      prefix: 'Failed to decode AggregateRepo serviceRepoName',
                    }),
                  );
                  const subscription = tx
                    .select()
                    .from(aggregateRepoDrizzleSchemas.serviceSubscriptions)
                    .where(
                      eq(
                        aggregateRepoDrizzleSchemas.serviceSubscriptions
                          .serviceRepoName,
                        persistedServiceRepoName,
                      ),
                    )
                    .get();
                  if (
                    subscription !== undefined &&
                    subscription.serviceName !== serviceAlignment.serviceName
                  ) {
                    return yield* new ZerospinError({
                      code: 'aggregate-service-subscription-name-mismatch',
                      message: `Subscription ${serviceAlignment.serviceRepoName} belongs to service "${subscription.serviceName}", not "${serviceAlignment.serviceName}"`,
                    });
                  }
                  if (
                    (subscription?.currentServiceIndex ?? null) !==
                    serviceAlignment.currentServiceIndex
                  ) {
                    return yield* new ZerospinError({
                      code: 'aggregate-service-subscription-watermark-changed',
                      message: `Subscription ${serviceAlignment.serviceRepoName} changed after its grouped snapshot was prepared`,
                    });
                  }
                  let currentServiceIndex =
                    serviceAlignment.currentServiceIndex ?? 0;
                  const orderedBlocks = [
                    ...serviceAlignment.serviceBlocks,
                  ].sort(
                    (left, right) => left.serviceIndex - right.serviceIndex,
                  );

                  for (const block of orderedBlocks) {
                    if (block.serviceIndex <= currentServiceIndex) {
                      continue;
                    }
                    const relevantMutations: IEncodedAppliedMutation[] = [];
                    for (const mutation of block.appliedMutations) {
                      if (mutation.operationName === 'replicateResource') {
                        continue;
                      }
                      const model = yield* getByKeyOrThrow({
                        record: aggregate.models,
                        key: mutation.modelName,
                        recordKind: `models owned by aggregate ${aggregateName}`,
                      });
                      if (
                        !('serviceName' in model) ||
                        model.serviceName !== serviceAlignment.serviceName
                      ) {
                        return yield* new ZerospinError({
                          code: 'replication-service-model-mismatch',
                          message: `Service block model "${mutation.modelName}" is not owned by service "${serviceAlignment.serviceName}"`,
                        });
                      }
                      const existingResource = tx
                        .select()
                        .from(model.drizzleSchema)
                        .where(eq(model.drizzleSchema.id, mutation.resourceId))
                        .get();
                      if (existingResource === undefined) {
                        continue;
                      }
                      yield* commitAppliedMutationTx({
                        tx,
                        models: aggregate.models,
                        mutation,
                      });
                      relevantMutations.push(mutation);
                    }
                    currentServiceIndex = block.serviceIndex;

                    if (relevantMutations.length === 0) {
                      continue;
                    }

                    // 5 — each relevant source block receives an earlier commandless aggregate position
                    currentAggregateIndex += 1;
                    const lastIntermediateAggregateCursor = yield* makeCursor({
                      abbreviation: coreAbbreviations.aggregateCursor,
                    });
                    const intermediateAggregateBlock =
                      yield* makeAggregateBlockTx({
                        writeIndex: block.writeIndex,
                        executedCommands: [],
                        failedCommands: [],
                        appliedMutations: relevantMutations,
                        lastAggregateCursor: lastIntermediateAggregateCursor,
                        aggregateIndex: currentAggregateIndex,
                        storage,
                        tx,
                      });
                    currentLastAggregateCursor =
                      intermediateAggregateBlock.lastAggregateCursor;
                    yield* upsertAggregateBlockTx({
                      aggregateBlock: {
                        ...intermediateAggregateBlock,
                        publishedAt: null,
                        failure: null,
                      },
                      tx,
                    });
                  }

                  if (
                    serviceAlignment.currentServiceIndex !== null &&
                    currentServiceIndex !== serviceAlignment.serviceIndex
                  ) {
                    return yield* new ZerospinError({
                      code: 'service-alignment-range-incomplete',
                      message: `Service ${serviceAlignment.serviceName} alignment did not reach snapshot index ${serviceAlignment.serviceIndex}`,
                    });
                  }

                  if (subscription === undefined) {
                    tx.insert(aggregateRepoDrizzleSchemas.serviceSubscriptions)
                      .values({
                        serviceRepoName: persistedServiceRepoName,
                        serviceName: serviceAlignment.serviceName,
                        currentServiceCursor:
                          serviceAlignment.lastServiceCursor,
                        currentServiceIndex: serviceAlignment.serviceIndex,
                        subscribedAt: null,
                        failure: null,
                      })
                      .run();
                  } else {
                    tx.update(aggregateRepoDrizzleSchemas.serviceSubscriptions)
                      .set({
                        currentServiceCursor:
                          serviceAlignment.lastServiceCursor,
                        currentServiceIndex: serviceAlignment.serviceIndex,
                      })
                      .where(
                        eq(
                          aggregateRepoDrizzleSchemas.serviceSubscriptions
                            .serviceRepoName,
                          persistedServiceRepoName,
                        ),
                      )
                      .run();
                  }
                }

                // 6 — one post-alignment cursor comparison governs guard trust for every sibling in this block
                const shouldRevalidateGuardsAtCommit =
                  currentLastAggregateCursor !==
                  pushBlock.guardedAtAggregateCursor;
                return {
                  currentAggregateIndex,
                  shouldRevalidateGuardsAtCommit,
                };
              },
            ),
          });
          let currentAggregateIndex = alignment.currentAggregateIndex;
          const executedCommands: Array<
            IEncodedCommand<IExecutedPushedCommand>
          > = [];
          const failedCommands: Array<IEncodedCommand<IFailedPushedCommand>> =
            [];
          const finalizedFailedStagedCommands: Array<
            IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
          > = [];
          const appliedMutations: IEncodedAppliedMutation[] = [];
          let lastAggregateCursor: IAggregateCursor | null = null;

          // 7 — each savepoint revalidates when stale, then applies all authoritative mutations or none
          const now = yield* dutils.date();
          for (const preparedCommand of preparedCommands) {
            currentAggregateIndex += 1;
            const aggregateCursor = yield* makeCursor({
              abbreviation: coreAbbreviations.aggregateCursor,
            });
            lastAggregateCursor = aggregateCursor;

            const finalized = yield* makeAsyncTx({
              storage,
              program: Effect.fn('AggregateRepo.finalizePushBlock.command')(
                function* () {
                  if (alignment.shouldRevalidateGuardsAtCommit) {
                    const guardResult = yield* runAggregateFrontendGuards({
                      db,
                      command: preparedCommand.pushedCommand,
                    }).pipe(Effect.either);
                    if (Either.isLeft(guardResult)) {
                      return Either.left(guardResult.left);
                    }
                  }

                  if (Either.isLeft(preparedCommand.preparation)) {
                    return Either.left(preparedCommand.preparation.left);
                  }
                  const preparation = preparedCommand.preparation.right;
                  return yield* makeTx({
                    db,
                    program: Effect.fn(
                      'AggregateRepo.finalizePushBlock.applyCommand',
                    )(function* ({ tx }) {
                      return yield* withSavepoint({
                        tx,
                        program: Effect.fn(
                          'AggregateRepo.finalizePushBlock.applyCommandSavepoint',
                        )(function* ({ tx: savepointTx }) {
                          const encodedCommandMutations: IEncodedAppliedMutation[] =
                            [];
                          for (const [
                            mutationIndex,
                            mutation,
                          ] of preparation.mutations.entries()) {
                            const appliedMutation =
                              yield* applyAggregateMutationTx({
                                tx: savepointTx,
                                mutation,
                                commandId: preparedCommand.pushedCommand.id,
                                mutationIndex,
                                appliedAt: now,
                              });
                            encodedCommandMutations.push(
                              yield* encodeAppliedMutation({
                                mutation: appliedMutation,
                              }),
                            );
                          }

                          return encodedCommandMutations;
                        }),
                      }).pipe(Effect.either);
                    }),
                  });
                },
              ),
            });

            if (Either.isLeft(finalized)) {
              failedCommands.push({
                ...preparedCommand.pushedCommand,
                aggregateCursor,
                aggregateIndex: currentAggregateIndex,
                failedAt: now,
                failure: ZerospinError.stringify(finalized.left),
                status: 'failed',
              });
              continue;
            }

            appliedMutations.push(...finalized.right);
            executedCommands.push({
              ...preparedCommand.pushedCommand,
              mode: 'authoritative',
              aggregateCursor,
              aggregateIndex: currentAggregateIndex,
              executedAt: now,
              status: 'executed',
            });
          }

          for (const failedStagedCommand of unseenFailedStagedCommands) {
            currentAggregateIndex += 1;
            const aggregateCursor = yield* makeCursor({
              abbreviation: coreAbbreviations.aggregateCursor,
            });
            lastAggregateCursor = aggregateCursor;
            finalizedFailedStagedCommands.push({
              ...failedStagedCommand,
              aggregateCursor,
              aggregateIndex: currentAggregateIndex,
            });
          }

          if (lastAggregateCursor === null) {
            return yield* new ZerospinError({
              code: 'pushed-block-finalized-no-commands',
              message: `PushBlock write ${pushBlock.writeIndex} produced no aggregate command outcomes`,
            });
          }

          // 8 — the final pushed block follows every intermediate service-derived outbox row
          return yield* makeTx({
            db,
            program: Effect.fn(
              'AggregateRepo.finalizePushBlock.storeAggregateBlock',
            )(function* ({ tx }) {
              const aggregateBlock = {
                writeIndex: pushBlock.writeIndex,
                lastAggregateCursor,
                aggregateIndex: currentAggregateIndex,
                executedCommands,
                failedCommands: [
                  ...failedCommands,
                  ...finalizedFailedStagedCommands,
                ],
                appliedMutations,
              };
              yield* setLastAggregateCursor({
                storage,
                tx,
                aggregateCursor: aggregateBlock.lastAggregateCursor,
              });
              yield* setLastAggregateIndex({
                storage,
                tx,
                aggregateIndex: aggregateBlock.aggregateIndex,
              });

              const outboxRecord = {
                ...aggregateBlock,
                failure: null,
                publishedAt: null,
              } satisfies IAggregateBlockOutboxRecord;
              yield* upsertAggregateBlockTx({
                aggregateBlock: outboxRecord,
                tx,
              });
              for (const command of [
                ...executedCommands,
                ...failedCommands,
                ...finalizedFailedStagedCommands,
              ]) {
                const commandBytes = commandBytesById.get(command.id);
                if (commandBytes === undefined) {
                  return yield* new ZerospinError({
                    code: 'aggregate-command-comparison-bytes-missing',
                    message: `PushBlock command ${command.id} has no comparison bytes`,
                  });
                }
                const commandMutations = appliedMutations.filter(
                  mutation => mutation.commandId === command.id,
                );
                const encodedTerminalCommand = yield* Schema.encode(
                  Schema.parseJson(
                    Schema.Union(
                      ExecutedPushedCommandSchema,
                      FailedPushedCommandSchema,
                      FinalizedFailedStagedReplicaCommandSchema,
                    ),
                  ),
                )(command).pipe(
                  mapParseError({
                    code: 'aggregate-push-command-outcome-encode-failed',
                    prefix: `Failed to encode PushBlock outcome ${command.id}`,
                  }),
                );
                const encodedCommandMutations = yield* Schema.encode(
                  Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
                )(commandMutations).pipe(
                  mapParseError({
                    code: 'aggregate-push-command-mutations-encode-failed',
                    prefix: `Failed to encode PushBlock mutations ${command.id}`,
                  }),
                );
                tx.insert(aggregateRepoDrizzleSchemas.aggregateCommandOutcomes)
                  .values({
                    commandId: command.id,
                    commandBytes,
                    command: encodedTerminalCommand,
                    aggregateCursor: command.aggregateCursor,
                    aggregateIndex: command.aggregateIndex,
                    appliedMutations: encodedCommandMutations,
                    writeIndex: pushBlock.writeIndex,
                  })
                  .run();
              }
            }),
          });
        },
      ),
    });
  },
);
