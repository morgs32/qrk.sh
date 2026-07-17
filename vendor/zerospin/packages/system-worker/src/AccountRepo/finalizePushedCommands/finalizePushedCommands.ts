/*
 * System-worker annotation:
 * Finalizes one immutable FrontendRepo pushed block into authoritative account
 * outcomes. Full encoded frontend commands remain intact in the block ledger.
 */

import { getFrontendBinding } from '@zerospin/core/accountController/getFrontendBinding';
import type { Async } from '@zerospin/core/async/Async';
import { applyAccountMutationTx } from '@zerospin/core/contracts/applyAccountMutationTx';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IAccountCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedPushedCommand,
  IFailedPushedCommand,
  IPushedBlock,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAccountCursor } from '@zerospin/core/models/types';
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
  getLastAccountCursor,
  getLastAccountIndex,
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import type { IAccountBlockOutboxRecord } from '../../types.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { makeAccountBlockTx } from '../finalizeAccountBlock/makeAccountBlockTx.js';
import { prepareAccountCommands } from '../finalizeAccountBlock/prepareAccountCommands.js';
import { upsertAccountBlockTx } from '../finalizeAccountBlock/upsertAccountBlockTx.js';

/*
 * 1. Validate pushed-block scope and return immutable prior outcomes.
 * 2. Adapt every valid pushed command while preserving original positions.
 * 3. Prepare all adapted account commands in one grouped replication batch.
 * 4. Read the account frontier and apply retained ServiceBlocks before snapshots join.
 * 5. Commit ordered commandless AccountBlocks and service watermarks at W.
 * 6. Choose one trusted or revalidated guard mode from the post-alignment cursor.
 * 7. Revalidate when required and finalize each command in its existing savepoint.
 * 8. Persist one final pushed AccountBlock after every intermediate block.
 */
export const finalizePushedCommands = Effect.fn(
  'AccountRepo.finalizePushedCommands',
)(function* (props: {
  generationId: string;
  accountId: string;
  accountName: string;
  pushedBlock: IPushedBlock;
  db: IDb;
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  IAccountBlockOutboxRecord,
  IAnyError,
  Async | CuidFactory | MonotonicFactory
> {
  const { generationId, accountId, accountName, pushedBlock, db, storage } =
    props;

  // 1 — reject scope/session mismatches before idempotency or command adaptation
  for (const pushedCommand of pushedBlock.commands) {
    if (
      pushedCommand.accountId !== accountId ||
      pushedCommand.accountName !== accountName
    ) {
      return yield* new ZerospinError({
        code: 'pushed-command-account-scope-mismatch',
        message: `Pushed command "${pushedCommand.id}" does not belong to AccountRepo ${accountId}/${accountName}`,
      });
    }
    if (pushedCommand.sessionId !== pushedBlock.sessionId) {
      return yield* new ZerospinError({
        code: 'pushed-command-session-mismatch',
        message: `Pushed command "${pushedCommand.id}" does not belong to pushed block session "${pushedBlock.sessionId}"`,
      });
    }
  }

  const existing = db
    .select()
    .from(accountRepoDrizzleSchemas.accountBlockOutbox)
    .where(
      eq(
        accountRepoDrizzleSchemas.accountBlockOutbox.pushedBlockId,
        pushedBlock.id,
      ),
    )
    .get();
  if (existing !== undefined) {
    const executedCommands = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedExecutedAccountCommandSchema,
            ExecutedPushedCommandSchema,
          ),
        ),
      ),
    )(existing.executedCommands).pipe(
      mapParseError({
        code: 'account-pushed-block-executed-commands-decode-failed',
        prefix: 'Failed to decode stored pushed-block executed commands',
      }),
    );
    const failedCommands = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedFailedAccountCommandSchema,
            FailedPushedCommandSchema,
          ),
        ),
      ),
    )(existing.failedCommands).pipe(
      mapParseError({
        code: 'account-pushed-block-failed-commands-decode-failed',
        prefix: 'Failed to decode stored pushed-block failed commands',
      }),
    );
    const appliedMutations = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(existing.appliedMutations).pipe(
      mapParseError({
        code: 'account-pushed-block-applied-mutations-decode-failed',
        prefix: 'Failed to decode stored pushed-block applied mutations',
      }),
    );
    const failure = yield* Schema.decodeUnknown(
      Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
    )(existing.failure).pipe(
      mapParseError({
        code: 'account-pushed-block-publish-failure-decode-failed',
        prefix: 'Failed to decode stored pushed-block publish failure',
      }),
    );

    return {
      pushedBlockId: existing.pushedBlockId,
      lastAccountCursor: existing.lastAccountCursor,
      accountIndex: existing.accountIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
      publishedAt: existing.publishedAt,
      failure,
    };
  }

  if (pushedBlock.commands.length === 0) {
    return yield* new ZerospinError({
      code: 'pushed-block-has-no-commands',
      message: `Pushed block "${pushedBlock.id}" has no commands`,
    });
  }

  // 2 — adapter failures stay at their original pushed-command positions
  const adaptedCommands: Array<
    {
      pushedCommand: IEncodedCommand<IPushedCommand>;
      accountCommand: Either.Either<IAccountCommand, IAnyError>;
    }
  > = [];

  for (const pushedCommand of pushedBlock.commands) {
    const accountCommand = yield* Effect.gen(function* () {
      const frontendBinding = yield* getFrontendBinding({
        system,
        accountName,
        actorName: pushedCommand.actorName,
        frontendName: pushedCommand.frontendName,
      });
      const frontendContract = yield* getByKeyOrThrow({
        record: frontendBinding.frontendController.contracts,
        key: pushedCommand.commandName,
        recordKind: 'frontend contracts',
      });
      if (pushedCommand.version !== frontendContract.version) {
        return yield* new ZerospinError({
          code: 'pushed-command-version-mismatch',
          message: `Command "${pushedCommand.commandName}" has version "${pushedCommand.version}" but frontend contract version is "${frontendContract.version}"`,
        });
      }

      const frontendPayload = yield* frontendContract.decodePayload({
        command: pushedCommand,
      });
      const contractAdapter = yield* getByKeyOrThrow({
        record: frontendBinding.contractAdapters,
        key: pushedCommand.commandName,
        recordKind: 'frontend binding contract adapters',
      });
      const targetContract = yield* getByKeyOrThrow({
        record: frontendBinding.contracts,
        key: pushedCommand.commandName,
        recordKind: 'frontend binding contracts',
      });
      const accountPayload = yield* contractAdapter({
        contract: frontendContract,
        payload: frontendPayload,
      });
      const accountCommand: IAccountCommand = {
        id: pushedCommand.id,
        commandName: targetContract.commandName,
        payload: accountPayload,
        version: targetContract.version,
        commandType: 'account',
        accountId: pushedCommand.accountId,
        accountName: pushedCommand.accountName,
        systemName: pushedCommand.systemName,
        systemVersion: pushedCommand.systemVersion,
        sessionId: pushedCommand.sessionId,
        actorId: pushedCommand.actorId,
        actorName: pushedCommand.actorName,
        frontendName: pushedCommand.frontendName,
        pushedCursor: pushedCommand.pushedCursor,
      };
      return accountCommand;
    }).pipe(Effect.either);

    adaptedCommands.push({ pushedCommand, accountCommand });
  }

  // 3 — collect all successful adapters, then call prepareAccountCommands exactly once
  const accountCommands: IAccountCommand[] = [];
  for (const adaptedCommand of adaptedCommands) {
    if (Either.isRight(adaptedCommand.accountCommand)) {
      accountCommands.push(adaptedCommand.accountCommand.right);
    }
  }
  const batchedPreparation = yield* prepareAccountCommands({
    generationId,
    accountName,
    commands: accountCommands,
    db,
  });
  const preparedCommands: Array<
    {
      pushedCommand: IEncodedCommand<IPushedCommand>;
      preparation: Effect.Effect.Success<
        ReturnType<typeof prepareAccountCommands>
      >['preparedCommands'][number]['mutations'];
    }
  > = [];
  let preparedAccountCommandIndex = 0;
  for (const adaptedCommand of adaptedCommands) {
    if (Either.isLeft(adaptedCommand.accountCommand)) {
      preparedCommands.push({
        pushedCommand: adaptedCommand.pushedCommand,
        preparation: Either.left(adaptedCommand.accountCommand.left),
      });
      continue;
    }
    const preparedAccountCommand =
      batchedPreparation.preparedCommands[preparedAccountCommandIndex];
    preparedAccountCommandIndex += 1;
    preparedCommands.push({
      pushedCommand: adaptedCommand.pushedCommand,
      preparation:
        preparedAccountCommand?.mutations ??
        Either.left(
          new ZerospinError({
            code: 'pushed-command-preparation-missing',
            message: `AccountRepo did not prepare pushed command "${adaptedCommand.pushedCommand.id}"`,
          }),
        ),
    });
  }

  return yield* makeTx({
    db,
    program: Effect.fn('AccountRepo.finalizePushedCommands.transaction')(
      function* ({ tx }) {
        const accountController = yield* getByKeyOrThrow({
          record: system.accountControllers,
          key: accountName,
          recordKind: 'accountControllers',
        });
        let currentAccountIndex = yield* getLastAccountIndex({
          storage,
          defaultValue: 0,
        });
        let currentLastAccountCursor =
          (yield* getLastAccountCursor({ storage })) ?? null;
        const executedCommands: Array<IEncodedCommand<IExecutedPushedCommand>> =
          [];
        const failedCommands: Array<IEncodedCommand<IFailedPushedCommand>> = [];
        const appliedMutations: IEncodedAppliedMutation[] = [];
        let lastAccountCursor: IAccountCursor | null = null;

        // 4 — start at the persisted account frontier, then align old members from C through W
        for (const serviceAlignment of batchedPreparation.serviceAlignments) {
          const persistedServiceRepoName = yield* Schema.decodeUnknown(
            makeAbbreviationIdSchema(coreAbbreviations.serviceRepo),
          )(serviceAlignment.serviceRepoName).pipe(
            mapParseError({
              code: 'account-service-repo-name-decode-failed',
              prefix: 'Failed to decode AccountRepo serviceRepoName',
            }),
          );
          const subscription = tx
            .select()
            .from(accountRepoDrizzleSchemas.serviceSubscriptions)
            .where(
              eq(
                accountRepoDrizzleSchemas.serviceSubscriptions
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
              code: 'account-service-subscription-name-mismatch',
              message: `Subscription ${serviceAlignment.serviceRepoName} belongs to service "${subscription.serviceName}", not "${serviceAlignment.serviceName}"`,
            });
          }
          if (
            (subscription?.currentServiceIndex ?? null) !==
            serviceAlignment.currentServiceIndex
          ) {
            return yield* new ZerospinError({
              code: 'account-service-subscription-watermark-changed',
              message: `Subscription ${serviceAlignment.serviceRepoName} changed after its grouped snapshot was prepared`,
            });
          }
          let currentServiceIndex =
            serviceAlignment.currentServiceIndex ?? 0;
          const orderedBlocks = [...serviceAlignment.serviceBlocks].sort(
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
                record: accountController.models,
                key: mutation.modelName,
                recordKind: `models owned by account ${accountName}`,
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
                models: accountController.models,
                mutation,
              });
              relevantMutations.push(mutation);
            }
            currentServiceIndex = block.serviceIndex;

            if (relevantMutations.length === 0) {
              continue;
            }

            // 5 — each relevant source block receives an earlier commandless account position
            currentAccountIndex += 1;
            const lastIntermediateAccountCursor = yield* makeCursor({
              abbreviation: coreAbbreviations.accountCursor,
            });
            const intermediateAccountBlock = yield* makeAccountBlockTx({
              accountName,
              pushedBlockId: null,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: relevantMutations,
              lastAccountCursor: lastIntermediateAccountCursor,
              accountIndex: currentAccountIndex,
              storage,
              tx,
            });
            currentLastAccountCursor =
              intermediateAccountBlock.lastAccountCursor;
            yield* upsertAccountBlockTx({
              accountBlock: {
                ...intermediateAccountBlock,
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
            tx.insert(accountRepoDrizzleSchemas.serviceSubscriptions)
              .values({
                serviceRepoName: persistedServiceRepoName,
                serviceName: serviceAlignment.serviceName,
                currentServiceCursor: serviceAlignment.lastServiceCursor,
                currentServiceIndex: serviceAlignment.serviceIndex,
                subscribedAt: null,
                failure: null,
              })
              .run();
          } else {
            tx.update(accountRepoDrizzleSchemas.serviceSubscriptions)
              .set({
                currentServiceCursor: serviceAlignment.lastServiceCursor,
                currentServiceIndex: serviceAlignment.serviceIndex,
              })
              .where(
                eq(
                  accountRepoDrizzleSchemas.serviceSubscriptions
                    .serviceRepoName,
                  persistedServiceRepoName,
                ),
              )
              .run();
          }
        }

        // 6 — one post-alignment cursor comparison governs guard trust for every sibling in this block
        const shouldRevalidateGuards =
          currentLastAccountCursor !== pushedBlock.admissionLastAccountCursor;

        // 7 — each savepoint revalidates when stale, then applies all authoritative mutations or none
        const now = yield* dutils.date();
        for (const preparedCommand of preparedCommands) {
          currentAccountIndex += 1;
          const accountCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.accountCursor,
          });
          lastAccountCursor = accountCursor;

          const finalized = yield* withSavepoint({
            tx,
            program: Effect.fn('AccountRepo.finalizePushedCommands.command')(
              function* ({ tx: savepointTx }) {
                if (shouldRevalidateGuards) {
                  const frontendBinding = yield* getFrontendBinding({
                    system,
                    accountName,
                    actorName: preparedCommand.pushedCommand.actorName,
                    frontendName: preparedCommand.pushedCommand.frontendName,
                  });
                  const frontendContract = yield* getByKeyOrThrow({
                    record: frontendBinding.frontendController.contracts,
                    key: preparedCommand.pushedCommand.commandName,
                    recordKind: 'frontend contracts',
                  });
                  if (
                    preparedCommand.pushedCommand.version !==
                    frontendContract.version
                  ) {
                    return yield* new ZerospinError({
                      code: 'pushed-command-version-mismatch',
                      message: `Command "${preparedCommand.pushedCommand.commandName}" has version "${preparedCommand.pushedCommand.version}" but frontend contract version is "${frontendContract.version}"`,
                    });
                  }
                  const decodedPayload = yield* frontendContract.decodePayload({
                    command: preparedCommand.pushedCommand,
                  });
                  const payload = yield* frontendContract.validatePayload({
                    payload: decodedPayload,
                  });
                  const guards = yield* getByKeyOrThrow({
                    record: frontendBinding.frontendController.guards,
                    key: preparedCommand.pushedCommand.commandName,
                    recordKind: 'frontend guards',
                  });
                  for (const guard of guards) {
                    yield* guard({
                      actorId: preparedCommand.pushedCommand.actorId,
                      db: savepointTx,
                      payload,
                    });
                  }
                }

                if (Either.isLeft(preparedCommand.preparation)) {
                  return yield* Effect.fail(preparedCommand.preparation.left);
                }

                const encodedCommandMutations: IEncodedAppliedMutation[] = [];
                for (const [
                  mutationIndex,
                  mutation,
                ] of preparedCommand.preparation.right.mutations.entries()) {
                  const appliedMutation = yield* applyAccountMutationTx({
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
              },
            ),
          }).pipe(Effect.either);

          if (Either.isLeft(finalized)) {
            failedCommands.push({
              ...preparedCommand.pushedCommand,
              accountCursor,
              accountIndex: currentAccountIndex,
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
            accountCursor,
            accountIndex: currentAccountIndex,
            executedAt: now,
            status: 'executed',
          });
        }

        if (lastAccountCursor === null) {
          return yield* new ZerospinError({
            code: 'pushed-block-finalized-no-commands',
            message: `Pushed block "${pushedBlock.id}" produced no account command outcomes`,
          });
        }

        // 8 — the final pushed block follows every intermediate service-derived outbox row
        const accountBlock = {
          pushedBlockId: pushedBlock.id,
          lastAccountCursor,
          accountIndex: currentAccountIndex,
          executedCommands,
          failedCommands,
          appliedMutations,
        };
        yield* setLastAccountCursor({
          storage,
          tx,
          accountCursor: accountBlock.lastAccountCursor,
        });
        yield* setLastAccountIndex({
          storage,
          tx,
          accountIndex: accountBlock.accountIndex,
        });

        const outboxRecord = {
          ...accountBlock,
          failure: null,
          publishedAt: null,
        } satisfies IAccountBlockOutboxRecord;
        yield* upsertAccountBlockTx({
          accountBlock: outboxRecord,
          tx,
        });
        return outboxRecord;
      },
    ),
  });
});
