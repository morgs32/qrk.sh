import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyAggregateMutationTx } from '@zerospin/core/contracts/applyAggregateMutationTx';
import {
  EncodedAggregateCommandSchema,
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  PushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/replayAppliedMutationTx';
import type {
  IAnyMutation,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedPushedCommand,
  IFailedAggregateCommand,
  IFailedPushedCommand,
  IFinalizedFailedStagedReplicaCommand,
} from '@zerospin/core/contracts/types';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateCursor } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq } from 'drizzle-orm';
import { Effect, JSONSchema, Schema } from 'effect';
import { system } from 'system';

import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateBlockSchema } from '../../blockSchemas.js';
import {
  setLastAggregateCursor,
  setLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import type {
  IAggregateBlock,
  IAggregateBlockOutboxRecord,
} from '../../types.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';
import { drainAggregateOutboxes } from '../drainAggregateOutboxes/drainAggregateOutboxes.js';
import { upsertAggregateBlockTx } from '../finalizeAggregateCommands/upsertAggregateBlockTx.js';

/** Rebuilds one aggregate block and durably proves its target-ledger publication. */
export const replayAggregateBlock = Effect.fn(
  'AggregateRepo.replayAggregateBlock',
)(function* (props: {
  aggregateId: string;
  aggregateName: string;
  aggregateRepoName: string;
  block: IAggregateBlock;
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  generationId: string;
  prevGenerationId: string;
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  Readonly<{
    replayed: boolean;
    lastAggregateCursor: IAggregateCursor;
    aggregateIndex: number;
    appliedMutationCount: number;
    discardedMutationCount: number;
  }>,
  IAnyError,
  Async
> {
  const {
    aggregateId,
    aggregateName,
    aggregateRepoName,
    block,
    db,
    deliveryQueue,
    generationId,
    prevGenerationId,
    storage,
  } = props;

  const validatedPrevGenerationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(prevGenerationId).pipe(
    mapParseError({
      code: 'aggregate-replay-prev-generation-id-invalid',
      prefix: 'Failed to decode the aggregate replay prevGenerationId',
    }),
  );

  // 1 — validate the complete source transport before any target write.
  yield* Schema.validate(AggregateBlockSchema)(block).pipe(
    mapParseError({
      code: 'aggregate-replay-source-block-invalid',
      prefix: `Failed to validate source aggregate block ${block.aggregateIndex}`,
    }),
  );
  const sourceBlockBytes = yield* Schema.encode(
    Schema.parseJson(AggregateBlockSchema),
  )(block).pipe(
    mapParseError({
      code: 'aggregate-replay-source-block-encode-failed',
      prefix: `Failed to encode source aggregate block ${block.aggregateIndex}`,
    }),
  );
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });

  // 2 — target-runtime adaptation, state writes, outbox, cursor watermark,
  // and receipt share one asynchronous storage transaction.
  const result = yield* makeAsyncTx({
    storage,
    program: Effect.fn('AggregateRepo.replayAggregateBlock.asyncTransaction')(
      function* () {
        const receipts = db
          .select()
          .from(aggregateRepoDrizzleSchemas.aggregateReplayReceipts)
          .where(
            eq(
              aggregateRepoDrizzleSchemas.aggregateReplayReceipts
                .sourceAggregateIndex,
              block.aggregateIndex,
            ),
          )
          .orderBy(
            asc(
              aggregateRepoDrizzleSchemas.aggregateReplayReceipts.completedAt,
            ),
          )
          .all();
        if (receipts.length > 1) {
          return yield* new ZerospinError({
            code: 'aggregate-replay-receipt-duplicate',
            message: `Aggregate block ${block.aggregateIndex} has more than one replay receipt`,
          });
        }
        const receipt = receipts[0];
        if (receipt !== undefined) {
          if (
            receipt.prevGenerationId !== validatedPrevGenerationId ||
            receipt.writeIndex !== block.writeIndex ||
            receipt.sourceBlockBytes !== sourceBlockBytes ||
            receipt.lastAggregateCursor !== block.lastAggregateCursor
          ) {
            return yield* new ZerospinError({
              code: 'aggregate-replay-receipt-mismatch',
              message: `Aggregate block ${block.aggregateIndex} replay receipt does not match the requested deploy, generation, or cursor`,
            });
          }
          const targetBlock = db
            .select({
              writeIndex:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.writeIndex,
              lastAggregateCursor:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox
                  .lastAggregateCursor,
              aggregateIndex:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
              executedCommands:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox
                  .executedCommands,
              failedCommands:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.failedCommands,
              appliedMutations:
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox
                  .appliedMutations,
            })
            .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
            .where(
              eq(
                aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
                block.aggregateIndex,
              ),
            )
            .get();
          const targetBlockBytes =
            targetBlock === undefined
              ? undefined
              : yield* Schema.encode(Schema.parseJson(AggregateBlockSchema))({
                  writeIndex: targetBlock.writeIndex,
                  lastAggregateCursor: targetBlock.lastAggregateCursor,
                  aggregateIndex: targetBlock.aggregateIndex,
                  executedCommands: yield* Schema.decodeUnknown(
                    Schema.parseJson(
                      Schema.Array(
                        Schema.Union(
                          EncodedExecutedAggregateCommandSchema,
                          ExecutedPushedCommandSchema,
                        ),
                      ),
                    ),
                  )(targetBlock.executedCommands).pipe(
                    mapParseError({
                      code: 'aggregate-replay-target-executed-commands-decode-failed',
                      prefix: `Failed to decode target aggregate block ${block.aggregateIndex} executed commands`,
                    }),
                  ),
                  failedCommands: yield* Schema.decodeUnknown(
                    Schema.parseJson(
                      Schema.Array(
                        Schema.Union(
                          EncodedFailedAggregateCommandSchema,
                          FinalizedFailedStagedReplicaCommandSchema,
                          FailedPushedCommandSchema,
                        ),
                      ),
                    ),
                  )(targetBlock.failedCommands).pipe(
                    mapParseError({
                      code: 'aggregate-replay-target-failed-commands-decode-failed',
                      prefix: `Failed to decode target aggregate block ${block.aggregateIndex} failed commands`,
                    }),
                  ),
                  appliedMutations: yield* Schema.decodeUnknown(
                    Schema.parseJson(
                      Schema.Array(EncodedAppliedMutationSchema),
                    ),
                  )(targetBlock.appliedMutations).pipe(
                    mapParseError({
                      code: 'aggregate-replay-target-mutations-decode-failed',
                      prefix: `Failed to decode target aggregate block ${block.aggregateIndex} mutations`,
                    }),
                  ),
                }).pipe(
                  mapParseError({
                    code: 'aggregate-replay-target-block-encode-failed',
                    prefix: `Failed to encode retained target aggregate block ${block.aggregateIndex}`,
                  }),
                );
          if (
            targetBlock === undefined ||
            targetBlock.writeIndex !== block.writeIndex ||
            targetBlock.lastAggregateCursor !== block.lastAggregateCursor ||
            targetBlock.aggregateIndex !== block.aggregateIndex ||
            targetBlockBytes !== receipt.targetBlockBytes
          ) {
            return yield* new ZerospinError({
              code: 'aggregate-replay-receipt-target-block-mismatch',
              message: `Aggregate block ${block.aggregateIndex} receipt has no exact target outbox block`,
            });
          }
          return {
            replayed: false,
            lastAggregateCursor: block.lastAggregateCursor,
            aggregateIndex: block.aggregateIndex,
            appliedMutationCount: receipt.appliedMutationCount,
            discardedMutationCount: receipt.discardedMutationCount,
          };
        }

        const conflictingTargetBlock = db
          .select({
            lastAggregateCursor:
              aggregateRepoDrizzleSchemas.aggregateBlockOutbox
                .lastAggregateCursor,
          })
          .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
          .where(
            eq(
              aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
              block.aggregateIndex,
            ),
          )
          .get();
        if (conflictingTargetBlock !== undefined) {
          return yield* new ZerospinError({
            code: 'aggregate-replay-target-block-without-receipt',
            message: `Aggregate block ${block.aggregateIndex} already exists without its replay receipt`,
          });
        }

        const preparedMutations: (IAnyMutation | null)[] = [];
        for (const mutation of block.appliedMutations) {
          const currentModel = Object.values(aggregate.models).find(
            model => model.modelName === mutation.modelName,
          );
          if (mutation.operationName === 'replicateResource') {
            const replication = yield* Schema.decodeUnknown(
              Schema.parseJson(
                Schema.Struct({
                  serviceName: Schema.String.pipe(Schema.minLength(1)),
                  resource: Schema.Unknown,
                }),
              ),
            )(mutation.operation, { onExcessProperty: 'error' }).pipe(
              mapParseError({
                code: 'aggregate-replay-replication-operation-invalid',
                prefix: `Failed to read service ownership from replay mutation ${mutation.modelName}@${mutation.modelVersion}`,
              }),
            );
            const service = yield* getByKeyOrThrow({
              record: system.services,
              key: replication.serviceName,
              recordKind: 'services',
            });
            preparedMutations.push(
              yield* prepareReplayAppliedMutation({
                mutation,
                controller: {
                  models: service.models,
                  mutationAdapters: service.mutationAdapters,
                },
              }),
            );
            continue;
          }
          if (
            currentModel !== undefined &&
            'serviceName' in currentModel &&
            typeof currentModel.serviceName === 'string'
          ) {
            const service = yield* getByKeyOrThrow({
              record: system.services,
              key: currentModel.serviceName,
              recordKind: 'services',
            });
            preparedMutations.push(
              yield* prepareReplayAppliedMutation({
                mutation,
                controller: {
                  models: service.models,
                  mutationAdapters: service.mutationAdapters,
                },
              }),
            );
            continue;
          }
          const candidateServices = [];
          for (const service of Object.values(system.services)) {
            const operationAdapters =
              service.mutationAdapters?.[mutation.modelName]?.[
                mutation.operationName
              ];
            if (operationAdapters === undefined) {
              continue;
            }
            for (const operationAdapter of operationAdapters) {
              const sourceJsonSchema = JSONSchema.make(operationAdapter.source);
              const sourceProperties = Reflect.get(
                sourceJsonSchema,
                'properties',
              );
              const sourceModelVersionProperty =
                typeof sourceProperties === 'object' &&
                sourceProperties !== null
                  ? Reflect.get(sourceProperties, 'modelVersion')
                  : undefined;
              const sourceModelVersions =
                typeof sourceModelVersionProperty === 'object' &&
                sourceModelVersionProperty !== null
                  ? Reflect.get(sourceModelVersionProperty, 'enum')
                  : undefined;
              const sourceModelVersion = Array.isArray(sourceModelVersions)
                ? sourceModelVersions[0]
                : undefined;
              if (sourceModelVersion === mutation.modelVersion) {
                candidateServices.push(service);
                break;
              }
            }
          }
          if (candidateServices.length > 1) {
            return yield* new ZerospinError({
              code: 'aggregate-replay-service-mutation-owner-ambiguous',
              message: `More than one service owns replay source mutation ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
            });
          }
          const service = candidateServices[0];
          preparedMutations.push(
            yield* prepareReplayAppliedMutation({
              mutation,
              controller:
                service === undefined
                  ? {
                      models: aggregate.models,
                      mutationAdapters: aggregate.mutationAdapters,
                    }
                  : {
                      models: service.models,
                      mutationAdapters: service.mutationAdapters,
                    },
            }),
          );
        }

        return yield* makeTx({
          db,
          program: Effect.fn('AggregateRepo.replayAggregateBlock.transaction')(
            function* ({ tx }) {
              const appliedMutations: IEncodedAppliedMutation[] = [];
              let discardedMutationCount = 0;
              for (const [
                sourceIndex,
                mutation,
              ] of block.appliedMutations.entries()) {
                const targetMutation = preparedMutations[sourceIndex];
                if (targetMutation === undefined) {
                  return yield* new ZerospinError({
                    code: 'aggregate-replay-prepared-mutation-missing',
                    message: `Replay preparation did not return mutation ${sourceIndex} for aggregate block ${block.aggregateIndex}`,
                  });
                }
                if (targetMutation === null) {
                  discardedMutationCount += 1;
                  continue;
                }
                const appliedMutation = yield* applyAggregateMutationTx({
                  tx,
                  mutation: targetMutation,
                  commandId: mutation.commandId,
                  mutationIndex: mutation.mutationIndex,
                  appliedAt: mutation.appliedAt,
                });
                appliedMutations.push(
                  yield* encodeAppliedMutation({ mutation: appliedMutation }),
                );
              }

              // 3 — install complete G2-materialized command outcomes with source provenance.
              let terminalAggregateCursor: IAggregateCursor | null = null;
              let terminalAggregateIndex: number | null = null;
              const terminalCommands: Array<
                | IEncodedCommand<IExecutedAggregateCommand>
                | IEncodedCommand<IExecutedPushedCommand>
                | IEncodedCommand<IFailedAggregateCommand>
                | IEncodedCommand<IFinalizedFailedStagedReplicaCommand>
                | IEncodedCommand<IFailedPushedCommand>
              > = [...block.executedCommands, ...block.failedCommands];
              for (const command of terminalCommands) {
                let commandBytes: string;
                if (command.commandType === 'aggregate') {
                  commandBytes = yield* Schema.encode(
                    Schema.parseJson(EncodedAggregateCommandSchema),
                  )(command).pipe(
                    mapParseError({
                      code: 'aggregate-replay-command-comparison-encode-failed',
                      prefix: `Failed to encode replayed aggregate command ${command.id} for exact comparison`,
                    }),
                  );
                } else if ('pushedAt' in command) {
                  if (command.status === 'executed') {
                    const {
                      aggregateCursor,
                      aggregateIndex,
                      executedAt,
                      mode,
                      status,
                      ...pushedCommand
                    } = command;
                    commandBytes = yield* Schema.encode(
                      Schema.parseJson(PushedCommandSchema),
                    )({ ...pushedCommand, status: 'pushed' }).pipe(
                      mapParseError({
                        code: 'aggregate-replay-command-comparison-encode-failed',
                        prefix: `Failed to encode replayed pushed command ${command.id} for exact comparison`,
                      }),
                    );
                  } else {
                    const {
                      aggregateCursor,
                      aggregateIndex,
                      failedAt,
                      failure,
                      status,
                      ...pushedCommand
                    } = command;
                    commandBytes = yield* Schema.encode(
                      Schema.parseJson(PushedCommandSchema),
                    )({ ...pushedCommand, status: 'pushed' }).pipe(
                      mapParseError({
                        code: 'aggregate-replay-command-comparison-encode-failed',
                        prefix: `Failed to encode replayed pushed command ${command.id} for exact comparison`,
                      }),
                    );
                  }
                } else {
                  const {
                    aggregateCursor,
                    aggregateIndex,
                    ...failedStagedCommand
                  } = command;
                  commandBytes = yield* Schema.encode(
                    Schema.parseJson(FailedStagedReplicaCommandSchema),
                  )(failedStagedCommand).pipe(
                    mapParseError({
                      code: 'aggregate-replay-command-comparison-encode-failed',
                      prefix: `Failed to encode replayed failed-staged command ${command.id} for exact comparison`,
                    }),
                  );
                }
                const encodedTerminalCommand = yield* Schema.encode(
                  Schema.parseJson(
                    Schema.Union(
                      EncodedExecutedAggregateCommandSchema,
                      ExecutedPushedCommandSchema,
                      EncodedFailedAggregateCommandSchema,
                      FinalizedFailedStagedReplicaCommandSchema,
                      FailedPushedCommandSchema,
                    ),
                  ),
                )(command).pipe(
                  mapParseError({
                    code: 'aggregate-replay-command-outcome-encode-failed',
                    prefix: `Failed to encode replayed aggregate command outcome ${command.id}`,
                  }),
                );
                const commandMutations = appliedMutations.filter(
                  mutation => mutation.commandId === command.id,
                );
                const encodedCommandMutations = yield* Schema.encode(
                  Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
                )(commandMutations).pipe(
                  mapParseError({
                    code: 'aggregate-replay-command-mutations-encode-failed',
                    prefix: `Failed to encode replayed aggregate command mutations ${command.id}`,
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
                    writeIndex: block.writeIndex,
                  })
                  .run();
                if (
                  terminalAggregateIndex === null ||
                  command.aggregateIndex > terminalAggregateIndex
                ) {
                  terminalAggregateCursor = command.aggregateCursor;
                  terminalAggregateIndex = command.aggregateIndex;
                }
              }
              if (
                terminalAggregateIndex !== null &&
                (terminalAggregateIndex !== block.aggregateIndex ||
                  terminalAggregateCursor !== block.lastAggregateCursor)
              ) {
                return yield* new ZerospinError({
                  code: 'aggregate-replay-source-command-bound-mismatch',
                  message: `Aggregate block ${block.aggregateIndex} terminal command does not match the block watermark`,
                });
              }

              // 4 — preserve full encoded commands and the exact source watermark.
              const targetBlock = {
                ...block,
                appliedMutations,
              } satisfies IAggregateBlock;
              const targetBlockBytes = yield* Schema.encode(
                Schema.parseJson(AggregateBlockSchema),
              )(targetBlock).pipe(
                mapParseError({
                  code: 'aggregate-replay-target-block-encode-failed',
                  prefix: `Failed to encode target aggregate block ${block.aggregateIndex}`,
                }),
              );
              const outboxRecord = {
                ...targetBlock,
                publishedAt: null,
                failure: null,
              } satisfies IAggregateBlockOutboxRecord;
              yield* upsertAggregateBlockTx({
                aggregateBlock: outboxRecord,
                tx,
              });
              tx.insert(aggregateRepoDrizzleSchemas.aggregateReplayReceipts)
                .values({
                  prevGenerationId: validatedPrevGenerationId,
                  writeIndex: block.writeIndex,
                  sourceBlockBytes,
                  targetBlockBytes,
                  sourceAggregateIndex: block.aggregateIndex,
                  lastAggregateCursor: block.lastAggregateCursor,
                  appliedMutationCount: appliedMutations.length,
                  discardedMutationCount,
                  completedAt: new Date(),
                })
                .run();
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

              return {
                replayed: true,
                lastAggregateCursor: block.lastAggregateCursor,
                aggregateIndex: block.aggregateIndex,
                appliedMutationCount: appliedMutations.length,
                discardedMutationCount,
              };
            },
          ),
        });
      },
    ),
  });

  // 5 — preparation is blocking: publish or fail before reporting this receipt complete.
  yield* drainAggregateOutboxes({
    aggregateRepoName,
    generationId,
    aggregateId,
    aggregateName,
    db,
    deliveryQueue,
    storage,
  });
  const publishedOutbox = db
    .select({
      lastAggregateCursor:
        aggregateRepoDrizzleSchemas.aggregateBlockOutbox.lastAggregateCursor,
      aggregateIndex:
        aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
      publishedAt: aggregateRepoDrizzleSchemas.aggregateBlockOutbox.publishedAt,
      failure: aggregateRepoDrizzleSchemas.aggregateBlockOutbox.failure,
    })
    .from(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
    .where(
      eq(
        aggregateRepoDrizzleSchemas.aggregateBlockOutbox.aggregateIndex,
        block.aggregateIndex,
      ),
    )
    .get();
  if (
    publishedOutbox === undefined ||
    publishedOutbox.lastAggregateCursor !== block.lastAggregateCursor ||
    publishedOutbox.aggregateIndex !== block.aggregateIndex ||
    publishedOutbox.publishedAt === null ||
    publishedOutbox.failure !== null
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-replay-target-publication-incomplete',
      message: `Aggregate block ${block.aggregateIndex} was not published exactly to the target ledger`,
    });
  }

  // 6 — verify the immutable target ledger, not only the local publication marker.
  const aggregateBlockRepo = yield* getAggregateBlockRepo({
    key: { generationId, aggregateId, aggregateName },
  });
  const publishedBlock = yield* makeAsync<
    Schema.EitherEncoded<IAggregateBlock | null, IAnyErrorJson>
  >(() =>
    aggregateBlockRepo.getReplayBlock({
      afterAggregateIndex: block.aggregateIndex - 1,
      throughAggregateIndex: block.aggregateIndex,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const retainedReplayReceipt = db
    .select({
      targetBlockBytes:
        aggregateRepoDrizzleSchemas.aggregateReplayReceipts.targetBlockBytes,
    })
    .from(aggregateRepoDrizzleSchemas.aggregateReplayReceipts)
    .where(
      eq(
        aggregateRepoDrizzleSchemas.aggregateReplayReceipts
          .sourceAggregateIndex,
        block.aggregateIndex,
      ),
    )
    .get();
  const publishedBlockBytes =
    publishedBlock === null
      ? null
      : yield* Schema.encode(Schema.parseJson(AggregateBlockSchema))(
          publishedBlock,
        ).pipe(
          mapParseError({
            code: 'aggregate-replay-published-block-encode-failed',
            prefix: `Failed to encode published aggregate block ${block.aggregateIndex}`,
          }),
        );
  if (
    publishedBlock === null ||
    retainedReplayReceipt === undefined ||
    publishedBlock.aggregateIndex !== block.aggregateIndex ||
    publishedBlock.lastAggregateCursor !== block.lastAggregateCursor ||
    publishedBlock.writeIndex !== block.writeIndex ||
    publishedBlockBytes !== retainedReplayReceipt.targetBlockBytes
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-replay-target-ledger-mismatch',
      message: `Target AggregateBlockRepo does not contain exact block ${block.aggregateIndex}`,
    });
  }

  return result;
});
