import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { replayAppliedMutationTx } from '@zerospin/core/contracts/replayAppliedMutationTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
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
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import type { IServiceBlock } from '../../types.js';
import { drainServiceBlockOutbox } from '../drainServiceBlockOutbox/drainServiceBlockOutbox.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

/** Rebuilds one service block and durably proves its target-ledger publication. */
export const replayServiceBlock = Effect.fn('ServiceRepo.replayServiceBlock')(
  function* (props: {
    block: IServiceBlock;
    db: IDb;
    deployId: string;
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
      deployId,
      generationId,
      prevGenerationId,
      serviceName,
      storage,
    } = props;

    const validatedDeployId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(cloudIdAbbreviations.deploy),
    )(deployId).pipe(
      mapParseError({
        code: 'service-replay-deploy-id-invalid',
        prefix: 'Failed to decode the service replay deployId',
      }),
    );
    const validatedPrevGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(cloudIdAbbreviations.generation),
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
    const serviceController = yield* getByKeyOrThrow({
      record: system.serviceControllers,
      key: serviceName,
      recordKind: 'serviceControllers',
    });

    // 2 — adapted state, exact outbox block, and idempotent receipt commit together.
    const result = yield* makeTx({
      db,
      program: Effect.fn('ServiceRepo.replayServiceBlock.transaction')(
        function* ({ tx }) {
          const receipts = tx
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
              asc(
                serviceRepoDrizzleSchemas.serviceReplayReceipts.completedAt,
              ),
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
              receipt.deployId !== validatedDeployId ||
              receipt.prevGenerationId !== validatedPrevGenerationId ||
              receipt.lastServiceCursor !== block.lastServiceCursor
            ) {
              return yield* new ZerospinError({
                code: 'service-replay-receipt-mismatch',
                message: `Service block ${block.serviceIndex} replay receipt does not match the requested deploy, generation, or cursor`,
              });
            }
            const targetBlock = tx
              .select({
                lastServiceCursor:
                  serviceRepoDrizzleSchemas.serviceBlockOutbox
                    .lastServiceCursor,
                serviceIndex:
                  serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
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
              targetBlock === undefined ||
              targetBlock.lastServiceCursor !== block.lastServiceCursor ||
              targetBlock.serviceIndex !== block.serviceIndex
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

          const conflictingTargetBlock = tx
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

          const appliedMutations = [];
          let discardedMutationCount = 0;
          for (const mutation of block.appliedMutations) {
            const replayedMutation = yield* replayAppliedMutationTx({
              tx,
              mutation,
              controller: {
                models: serviceController.models,
                mutationAdapters: serviceController.mutationAdapters,
              },
            });
            if (replayedMutation === null) {
              discardedMutationCount += 1;
              continue;
            }
            appliedMutations.push(replayedMutation);
          }

          // 3 — command cursor rows preserve every original command timestamp and index.
          let terminalServiceCursor: IServiceCursorId | null = null;
          let terminalServiceIndex: number | null = null;
          for (const command of block.executedCommands) {
            tx.insert(serviceRepoDrizzleSchemas.serviceCursors)
              .values({
                commandId: command.id,
                serviceCursor: command.serviceCursor,
                serviceIndex: command.serviceIndex,
                appliedAt: command.executedAt,
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
          for (const command of block.failedCommands) {
            tx.insert(serviceRepoDrizzleSchemas.serviceCursors)
              .values({
                commandId: command.id,
                serviceCursor: command.serviceCursor,
                serviceIndex: command.serviceIndex,
                appliedAt: command.failedAt,
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
              deployId: validatedDeployId,
              prevGenerationId: validatedPrevGenerationId,
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

    // 5 — preparation is blocking: publish or fail before reporting this receipt complete.
    yield* drainServiceBlockOutbox({
      db,
      storage,
      generationId,
      serviceName,
    });
    const publishedOutbox = db
      .select({
        lastServiceCursor:
          serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
        serviceIndex:
          serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex,
        publishedAt:
          serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt,
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
    if (
      publishedBlock === null ||
      publishedBlock.serviceIndex !== block.serviceIndex ||
      publishedBlock.lastServiceCursor !== block.lastServiceCursor
    ) {
      return yield* new ZerospinError({
        code: 'service-replay-target-ledger-mismatch',
        message: `Target ServiceBlockRepo does not contain exact block ${block.serviceIndex}`,
      });
    }

    return result;
  },
);
