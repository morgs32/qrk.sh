import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { replayAppliedMutationTx } from '@zerospin/core/contracts/replayAppliedMutationTx';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAccountCursor } from '@zerospin/core/models/types';
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
import { Effect, JSONSchema, Schema } from 'effect';
import { system } from 'system';

import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { AccountBlockSchema } from '../../blockSchemas.js';
import {
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import type { IAccountBlock, IAccountBlockOutboxRecord } from '../../types.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { drainAccountOutboxes } from '../drainAccountOutboxes/drainAccountOutboxes.js';
import { upsertAccountBlockTx } from '../finalizeAccountBlock/upsertAccountBlockTx.js';

/** Rebuilds one account block and durably proves its target-ledger publication. */
export const replayAccountBlock = Effect.fn('AccountRepo.replayAccountBlock')(
  function* (props: {
    accountId: string;
    accountName: string;
    accountRepoName: string;
    block: IAccountBlock;
    db: IDb;
    deployId: string;
    generationId: string;
    prevGenerationId: string;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      replayed: boolean;
      lastAccountCursor: IAccountCursor;
      accountIndex: number;
      appliedMutationCount: number;
      discardedMutationCount: number;
    }>,
    IAnyError,
    Async
  > {
    const {
      accountId,
      accountName,
      accountRepoName,
      block,
      db,
      deployId,
      generationId,
      prevGenerationId,
      storage,
    } = props;

    const validatedDeployId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(cloudIdAbbreviations.deploy),
    )(deployId).pipe(
      mapParseError({
        code: 'account-replay-deploy-id-invalid',
        prefix: 'Failed to decode the account replay deployId',
      }),
    );
    const validatedPrevGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(cloudIdAbbreviations.generation),
    )(prevGenerationId).pipe(
      mapParseError({
        code: 'account-replay-prev-generation-id-invalid',
        prefix: 'Failed to decode the account replay prevGenerationId',
      }),
    );

    // 1 — validate the complete source transport before any target write.
    yield* Schema.validate(AccountBlockSchema)(block).pipe(
      mapParseError({
        code: 'account-replay-source-block-invalid',
        prefix: `Failed to validate source account block ${block.accountIndex}`,
      }),
    );
    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    // 2 — adapted state, exact outbox block, cursor watermark, and receipt commit together.
    const result = yield* makeTx({
      db,
      program: Effect.fn('AccountRepo.replayAccountBlock.transaction')(
        function* ({ tx }) {
          const receipts = tx
            .select()
            .from(accountRepoDrizzleSchemas.accountReplayReceipts)
            .where(
              eq(
                accountRepoDrizzleSchemas.accountReplayReceipts
                  .sourceAccountIndex,
                block.accountIndex,
              ),
            )
            .orderBy(
              asc(
                accountRepoDrizzleSchemas.accountReplayReceipts.completedAt,
              ),
            )
            .all();
          if (receipts.length > 1) {
            return yield* new ZerospinError({
              code: 'account-replay-receipt-duplicate',
              message: `Account block ${block.accountIndex} has more than one replay receipt`,
            });
          }
          const receipt = receipts[0];
          if (receipt !== undefined) {
            if (
              receipt.deployId !== validatedDeployId ||
              receipt.prevGenerationId !== validatedPrevGenerationId ||
              receipt.lastAccountCursor !== block.lastAccountCursor
            ) {
              return yield* new ZerospinError({
                code: 'account-replay-receipt-mismatch',
                message: `Account block ${block.accountIndex} replay receipt does not match the requested deploy, generation, or cursor`,
              });
            }
            const targetBlock = tx
              .select({
                lastAccountCursor:
                  accountRepoDrizzleSchemas.accountBlockOutbox
                    .lastAccountCursor,
                accountIndex:
                  accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
              })
              .from(accountRepoDrizzleSchemas.accountBlockOutbox)
              .where(
                eq(
                  accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
                  block.accountIndex,
                ),
              )
              .get();
            if (
              targetBlock === undefined ||
              targetBlock.lastAccountCursor !== block.lastAccountCursor ||
              targetBlock.accountIndex !== block.accountIndex
            ) {
              return yield* new ZerospinError({
                code: 'account-replay-receipt-target-block-mismatch',
                message: `Account block ${block.accountIndex} receipt has no exact target outbox block`,
              });
            }
            return {
              replayed: false,
              lastAccountCursor: block.lastAccountCursor,
              accountIndex: block.accountIndex,
              appliedMutationCount: receipt.appliedMutationCount,
              discardedMutationCount: receipt.discardedMutationCount,
            };
          }

          const conflictingTargetBlock = tx
            .select({
              lastAccountCursor:
                accountRepoDrizzleSchemas.accountBlockOutbox.lastAccountCursor,
            })
            .from(accountRepoDrizzleSchemas.accountBlockOutbox)
            .where(
              eq(
                accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
                block.accountIndex,
              ),
            )
            .get();
          if (conflictingTargetBlock !== undefined) {
            return yield* new ZerospinError({
              code: 'account-replay-target-block-without-receipt',
              message: `Account block ${block.accountIndex} already exists without its replay receipt`,
            });
          }

          const appliedMutations: IEncodedAppliedMutation[] = [];
          let discardedMutationCount = 0;
          for (const mutation of block.appliedMutations) {
            // 3 — replicated and service-origin mutations remain owned by their service controller.
            const currentModel = Object.values(accountController.models).find(
              model => model.modelName === mutation.modelName,
            );
            if (mutation.operationName === 'replicateResource') {
              const replication = yield* Schema.decodeUnknown(
                Schema.parseJson(
                  Schema.Struct({
                    serviceName: Schema.String,
                    resource: Schema.Unknown,
                  }),
                ),
              )(mutation.operation).pipe(
                mapParseError({
                  code: 'account-replay-replication-operation-invalid',
                  prefix: `Failed to read service ownership from replay mutation ${mutation.modelName}@${mutation.modelVersion}`,
                }),
              );
              const serviceController = yield* getByKeyOrThrow({
                record: system.serviceControllers,
                key: replication.serviceName,
                recordKind: 'serviceControllers',
              });
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
              } else {
                appliedMutations.push(replayedMutation);
              }
              continue;
            }

            if (
              currentModel !== undefined &&
              'serviceName' in currentModel &&
              typeof currentModel.serviceName === 'string'
            ) {
              const serviceController = yield* getByKeyOrThrow({
                record: system.serviceControllers,
                key: currentModel.serviceName,
                recordKind: 'serviceControllers',
              });
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
              } else {
                appliedMutations.push(replayedMutation);
              }
              continue;
            }

            // 4 — a retired service model is identified by its one controller-owned source map.
            const candidateServiceControllers = [];
            for (const serviceController of Object.values(
              system.serviceControllers,
            )) {
              const operationAdapters =
                serviceController.mutationAdapters?.[mutation.modelName]?.[
                  mutation.operationName
                ];
              if (operationAdapters === undefined) {
                continue;
              }

              // The owner must declare this exact historical source semver.
              // A controller with an edge for another version does not own the
              // persisted mutation being replayed.
              for (const operationAdapter of operationAdapters) {
                const sourceJsonSchema = JSONSchema.make(
                  operationAdapter.source,
                );
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
                  candidateServiceControllers.push(serviceController);
                  break;
                }
              }
            }
            if (candidateServiceControllers.length > 1) {
              return yield* new ZerospinError({
                code: 'account-replay-service-mutation-owner-ambiguous',
                message: `More than one service controller owns replay source mutation ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
              });
            }
            const serviceController = candidateServiceControllers[0];
            const replayedMutation = yield* replayAppliedMutationTx({
              tx,
              mutation,
              controller:
                serviceController === undefined
                  ? {
                      models: accountController.models,
                      mutationAdapters: accountController.mutationAdapters,
                    }
                  : {
                      models: serviceController.models,
                      mutationAdapters: serviceController.mutationAdapters,
                    },
            });
            if (replayedMutation === null) {
              discardedMutationCount += 1;
            } else {
              appliedMutations.push(replayedMutation);
            }
          }

          // 5 — preserve the full encoded commands and exact source block watermark.
          const targetBlock = {
            ...block,
            appliedMutations,
          } satisfies IAccountBlock;
          const outboxRecord = {
            ...targetBlock,
            publishedAt: null,
            failure: null,
          } satisfies IAccountBlockOutboxRecord;
          yield* upsertAccountBlockTx({ accountBlock: outboxRecord, tx });
          tx.insert(accountRepoDrizzleSchemas.accountReplayReceipts)
            .values({
              deployId: validatedDeployId,
              prevGenerationId: validatedPrevGenerationId,
              sourceAccountIndex: block.accountIndex,
              lastAccountCursor: block.lastAccountCursor,
              appliedMutationCount: appliedMutations.length,
              discardedMutationCount,
              completedAt: new Date(),
            })
            .run();
          yield* setLastAccountCursor({
            storage,
            tx,
            accountCursor: block.lastAccountCursor,
          });
          yield* setLastAccountIndex({
            storage,
            tx,
            accountIndex: block.accountIndex,
          });

          return {
            replayed: true,
            lastAccountCursor: block.lastAccountCursor,
            accountIndex: block.accountIndex,
            appliedMutationCount: appliedMutations.length,
            discardedMutationCount,
          };
        },
      ),
    });

    // 6 — preparation is blocking: publish or fail before reporting this receipt complete.
    yield* drainAccountOutboxes({
      accountRepoName,
      generationId,
      accountId,
      accountName,
      db,
      storage,
    });
    const publishedOutbox = db
      .select({
        lastAccountCursor:
          accountRepoDrizzleSchemas.accountBlockOutbox.lastAccountCursor,
        accountIndex:
          accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
        publishedAt:
          accountRepoDrizzleSchemas.accountBlockOutbox.publishedAt,
        failure: accountRepoDrizzleSchemas.accountBlockOutbox.failure,
      })
      .from(accountRepoDrizzleSchemas.accountBlockOutbox)
      .where(
        eq(
          accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex,
          block.accountIndex,
        ),
      )
      .get();
    if (
      publishedOutbox === undefined ||
      publishedOutbox.lastAccountCursor !== block.lastAccountCursor ||
      publishedOutbox.accountIndex !== block.accountIndex ||
      publishedOutbox.publishedAt === null ||
      publishedOutbox.failure !== null
    ) {
      return yield* new ZerospinError({
        code: 'account-replay-target-publication-incomplete',
        message: `Account block ${block.accountIndex} was not published exactly to the target ledger`,
      });
    }

    // 7 — verify the immutable target ledger, not only the local publication marker.
    const accountBlockRepo = yield* getAccountBlockRepo({
      key: { generationId, accountId, accountName },
    });
    const publishedBlock = yield* makeAsync<
      Schema.EitherEncoded<IAccountBlock | null, IAnyErrorJson>
    >(() =>
      accountBlockRepo.getReplayBlock({
        afterAccountIndex: block.accountIndex - 1,
        throughAccountIndex: block.accountIndex,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    if (
      publishedBlock === null ||
      publishedBlock.accountIndex !== block.accountIndex ||
      publishedBlock.lastAccountCursor !== block.lastAccountCursor
    ) {
      return yield* new ZerospinError({
        code: 'account-replay-target-ledger-mismatch',
        message: `Target AccountBlockRepo does not contain exact block ${block.accountIndex}`,
      });
    }

    return result;
  },
);
