import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyMutationTx } from '@zerospin/core/contracts/applyMutationTx';
import {
  EncodedExecutedServiceCommandSchema,
  EncodedFailedServiceCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import { prepareReplayAppliedMutation } from '@zerospin/core/contracts/replayAppliedMutationTx';
import type {
  IAnyMutation,
  IEncodedAppliedMutation,
} from '@zerospin/core/contracts/types';
import { makeAsyncTx } from '@zerospin/core/drizzle/makeAsyncTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
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
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import type { IServiceBlock } from '../../types.js';
import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/** Rebuilds one service block and durably proves its target-ledger publication. */
export const replayServiceBlock = Effect.fn('ServiceRepo.replayServiceBlock')(
  function* (props: {
    block: IServiceBlock;
    db: IDb;
    deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
    generationId: string;
    prevGenerationId: string;
    serviceName: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      replayed: boolean;
      lastServiceCursor: IServiceCursorId;
      serviceIndex: number;
      appliedMutationCount: number;
      discardedMutationCount: number;
    }>,
    IAnyError,
    Async
  > {
    const {
      block,
      db,
      deliveryQueue,
      generationId,
      prevGenerationId,
      serviceName,
      storage,
    } = props;

    const validatedPrevGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(prevGenerationId).pipe(
      mapParseError({
        code: 'service-replay-prev-generation-id-invalid',
        prefix: 'Failed to decode the service replay prevGenerationId',
      }),
    );

    // 1 — validate the complete source transport before any target write.
    yield* Schema.validate(ServiceBlockSchema)(block).pipe(
      mapParseError({
        code: 'service-replay-source-block-invalid',
        prefix: `Failed to validate source service block ${block.serviceIndex}`,
      }),
    );
    const sourceBlockBytes = yield* Schema.encode(
      Schema.parseJson(ServiceBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-replay-source-block-encode-failed',
        prefix: `Failed to encode source service block ${block.serviceIndex}`,
      }),
    );
    const serviceController = yield* getByKeyOrThrow({
      record: system.services,
      key: serviceName,
      recordKind: 'services',
    });

    // 2 — target-runtime adaptation, state writes, outbox, and receipt share one
    // asynchronous storage transaction. A runtime transport failure therefore
    // leaves no partially replayed block behind.
    const result = yield* makeAsyncTx({
      storage,
      program: Effect.fn('ServiceRepo.replayServiceBlock.asyncTransaction')(
        function* () {
          const receipts = db
            .select()
            .from(serviceRepoDrizzleSchemas.serviceReplayReceipts)
            .where(
              eq(
                serviceRepoDrizzleSchemas.serviceReplayReceipts
                  .sourceServiceIndex,
                block.serviceIndex,
              ),
            )
            .orderBy(
              asc(serviceRepoDrizzleSchemas.serviceReplayReceipts.completedAt),
            )
            .all();
          if (receipts.length > 1) {
            return yield* new ZerospinError({
              code: 'service-replay-receipt-duplicate',
              message: `Service block ${block.serviceIndex} has more than one replay receipt`,
            });
          }
          const receipt = receipts[0];
          if (receipt !== undefined) {
            if (
              receipt.prevGenerationId !== validatedPrevGenerationId ||
              receipt.writeIndex !== block.writeIndex ||
              receipt.sourceBlockBytes !== sourceBlockBytes ||
              receipt.lastServiceCursor !== block.lastServiceCursor
            ) {
              return yield* new ZerospinError({
                code: 'service-replay-receipt-mismatch',
                message: `Service block ${block.serviceIndex} replay receipt does not match the requested deploy, generation, or cursor`,
              });
            }
            const targetBlock = db
              .select({
                lastServiceCursor:
                  serviceRepoDrizzleSchemas.serviceBlockOutbox
                    .lastServiceCursor,
                serviceIndex:
                  serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
                block: serviceRepoDrizzleSchemas.serviceBlockOutbox.block,
              })
              .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
              .where(
                eq(
                  serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
                  block.serviceIndex,
                ),
              )
              .get();
            const decodedTargetBlock =
              targetBlock === undefined
                ? undefined
                : yield* Schema.decodeUnknown(
                    Schema.parseJson(ServiceBlockSchema),
                  )(targetBlock.block).pipe(
                    mapParseError({
                      code: 'service-replay-receipt-target-block-decode-failed',
                      prefix: `Failed to decode retained target service block ${block.serviceIndex}`,
                    }),
                  );
            if (
              targetBlock === undefined ||
              decodedTargetBlock === undefined ||
              targetBlock.lastServiceCursor !== block.lastServiceCursor ||
              targetBlock.serviceIndex !== block.serviceIndex ||
              decodedTargetBlock.writeIndex !== block.writeIndex ||
              targetBlock.block !== receipt.targetBlockBytes
            ) {
              return yield* new ZerospinError({
                code: 'service-replay-receipt-target-block-mismatch',
                message: `Service block ${block.serviceIndex} receipt has no exact target outbox block`,
              });
            }
            return {
              replayed: false,
              lastServiceCursor: block.lastServiceCursor,
              serviceIndex: block.serviceIndex,
              appliedMutationCount: receipt.appliedMutationCount,
              discardedMutationCount: receipt.discardedMutationCount,
            };
          }

          const conflictingTargetBlock = db
            .select({
              lastServiceCursor:
                serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
            })
            .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
            .where(
              eq(
                serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
                block.serviceIndex,
              ),
            )
            .get();
          if (conflictingTargetBlock !== undefined) {
            return yield* new ZerospinError({
              code: 'service-replay-target-block-without-receipt',
              message: `Service block ${block.serviceIndex} already exists without its replay receipt`,
            });
          }

          const preparedMutations: (IAnyMutation | null)[] = [];
          for (const mutation of block.appliedMutations) {
            preparedMutations.push(
              yield* prepareReplayAppliedMutation({
                mutation,
                controller: {
                  models: serviceController.models,
                  mutationAdapters: serviceController.mutationAdapters,
                },
              }),
            );
          }

          return yield* makeTx({
            db,
            program: Effect.fn('ServiceRepo.replayServiceBlock.transaction')(
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
                      code: 'service-replay-prepared-mutation-missing',
                      message: `Replay preparation did not return mutation ${sourceIndex} for service block ${block.serviceIndex}`,
                    });
                  }
                  if (targetMutation === null) {
                    discardedMutationCount += 1;
                    continue;
                  }
                  if (targetMutation.operationName === 'replicateResource') {
                    return yield* new ZerospinError({
                      code: 'service-replay-replication-mutation-invalid',
                      message:
                        'A service-owned authoritative model cannot replay a replicateResource mutation',
                      extra: {
                        serviceName,
                        modelName: targetMutation.model.modelName,
                        modelVersion: targetMutation.modelVersion,
                      },
                    });
                  }
                  const appliedMutation = yield* applyMutationTx({
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

                // 3 — command outcomes preserve every full terminal command,
                // its exact input bytes, adapted mutations, and source provenance.
                let terminalServiceCursor: IServiceCursorId | null = null;
                let terminalServiceIndex: number | null = null;
                for (const command of [
                  ...block.executedCommands,
                  ...block.failedCommands,
                ]) {
                  const commandBytes = yield* Schema.encode(
                    Schema.parseJson(EncodedServiceCommandSchema),
                  )(command).pipe(
                    mapParseError({
                      code: 'service-replay-command-comparison-encode-failed',
                      prefix: `Failed to encode replayed service command ${command.id} for exact comparison`,
                    }),
                  );
                  const encodedTerminalCommand = yield* Schema.encode(
                    Schema.parseJson(
                      Schema.Union(
                        EncodedExecutedServiceCommandSchema,
                        EncodedFailedServiceCommandSchema,
                      ),
                    ),
                  )(command).pipe(
                    mapParseError({
                      code: 'service-replay-command-outcome-encode-failed',
                      prefix: `Failed to encode replayed service command outcome ${command.id}`,
                    }),
                  );
                  const commandMutations = appliedMutations.filter(
                    mutation => mutation.commandId === command.id,
                  );
                  const encodedCommandMutations = yield* Schema.encode(
                    Schema.parseJson(
                      Schema.Array(EncodedAppliedMutationSchema),
                    ),
                  )(commandMutations).pipe(
                    mapParseError({
                      code: 'service-replay-command-mutations-encode-failed',
                      prefix: `Failed to encode replayed service command mutations ${command.id}`,
                    }),
                  );
                  tx.insert(serviceRepoDrizzleSchemas.serviceCommandOutcomes)
                    .values({
                      commandId: command.id,
                      commandBytes,
                      command: encodedTerminalCommand,
                      serviceCursor: command.serviceCursor,
                      serviceIndex: command.serviceIndex,
                      appliedMutations: encodedCommandMutations,
                      writeIndex: block.writeIndex,
                    })
                    .run();
                  if (
                    terminalServiceIndex === null ||
                    command.serviceIndex > terminalServiceIndex
                  ) {
                    terminalServiceCursor = command.serviceCursor;
                    terminalServiceIndex = command.serviceIndex;
                  }
                }
                if (
                  terminalServiceIndex !== null &&
                  (terminalServiceIndex !== block.serviceIndex ||
                    terminalServiceCursor !== block.lastServiceCursor)
                ) {
                  return yield* new ZerospinError({
                    code: 'service-replay-source-command-bound-mismatch',
                    message: `Service block ${block.serviceIndex} terminal command does not match the block watermark`,
                  });
                }

                // 4 — commands remain byte-for-byte encoded; only persisted mutations change.
                const targetBlock = {
                  ...block,
                  appliedMutations,
                } satisfies IServiceBlock;
                const encodedTargetBlock = yield* Schema.encode(
                  Schema.parseJson(ServiceBlockSchema),
                )(targetBlock).pipe(
                  mapParseError({
                    code: 'service-replay-target-block-encode-failed',
                    prefix: `Failed to encode target service block ${block.serviceIndex}`,
                  }),
                );
                tx.insert(serviceRepoDrizzleSchemas.serviceBlockOutbox)
                  .values({
                    lastServiceCursor: block.lastServiceCursor,
                    serviceIndex: block.serviceIndex,
                    block: encodedTargetBlock,
                    publishedAt: null,
                    failure: null,
                  })
                  .run();
                tx.insert(serviceRepoDrizzleSchemas.serviceReplayReceipts)
                  .values({
                    prevGenerationId: validatedPrevGenerationId,
                    writeIndex: block.writeIndex,
                    sourceBlockBytes,
                    targetBlockBytes: encodedTargetBlock,
                    sourceServiceIndex: block.serviceIndex,
                    lastServiceCursor: block.lastServiceCursor,
                    appliedMutationCount: appliedMutations.length,
                    discardedMutationCount,
                    completedAt: new Date(),
                  })
                  .run();

                return {
                  replayed: true,
                  lastServiceCursor: block.lastServiceCursor,
                  serviceIndex: block.serviceIndex,
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
    yield* drainServiceBlockOutbox({
      db,
      deliveryQueue,
      storage,
      generationId,
      serviceName,
    });
    const publishedOutbox = db
      .select({
        lastServiceCursor:
          serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
        serviceIndex: serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
        publishedAt: serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt,
        failure: serviceRepoDrizzleSchemas.serviceBlockOutbox.failure,
      })
      .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
      .where(
        eq(
          serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
          block.serviceIndex,
        ),
      )
      .get();
    if (
      publishedOutbox === undefined ||
      publishedOutbox.lastServiceCursor !== block.lastServiceCursor ||
      publishedOutbox.serviceIndex !== block.serviceIndex ||
      publishedOutbox.publishedAt === null ||
      publishedOutbox.failure !== null
    ) {
      return yield* new ZerospinError({
        code: 'service-replay-target-publication-incomplete',
        message: `Service block ${block.serviceIndex} was not published exactly to the target ledger`,
      });
    }

    // 6 — verify the immutable target ledger, not only the local publication marker.
    const serviceBlockRepo = yield* getServiceBlockRepo({
      key: { generationId, serviceName },
    });
    const publishedBlock = yield* makeAsync<
      Schema.EitherEncoded<IServiceBlock | null, IAnyErrorJson>
    >(() =>
      serviceBlockRepo.getReplayBlock({
        afterServiceIndex: block.serviceIndex - 1,
        throughServiceIndex: block.serviceIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    const retainedReplayReceipt = db
      .select({
        targetBlockBytes:
          serviceRepoDrizzleSchemas.serviceReplayReceipts.targetBlockBytes,
      })
      .from(serviceRepoDrizzleSchemas.serviceReplayReceipts)
      .where(
        eq(
          serviceRepoDrizzleSchemas.serviceReplayReceipts.sourceServiceIndex,
          block.serviceIndex,
        ),
      )
      .get();
    const publishedBlockBytes =
      publishedBlock === null
        ? null
        : yield* Schema.encode(Schema.parseJson(ServiceBlockSchema))(
            publishedBlock,
          ).pipe(
            mapParseError({
              code: 'service-replay-published-block-encode-failed',
              prefix: `Failed to encode published service block ${block.serviceIndex}`,
            }),
          );
    if (
      publishedBlock === null ||
      retainedReplayReceipt === undefined ||
      publishedBlock.serviceIndex !== block.serviceIndex ||
      publishedBlock.lastServiceCursor !== block.lastServiceCursor ||
      publishedBlock.writeIndex !== block.writeIndex ||
      publishedBlockBytes !== retainedReplayReceipt.targetBlockBytes
    ) {
      return yield* new ZerospinError({
        code: 'service-replay-target-ledger-mismatch',
        message: `Target ServiceBlockRepo does not contain exact block ${block.serviceIndex}`,
      });
    }

    return result;
  },
);
