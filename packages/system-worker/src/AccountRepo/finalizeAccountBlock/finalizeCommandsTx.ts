/*
 * System-worker annotation:
 * Finalizes account commands inside the already-open AccountRepo transaction.
 * Prepared command failures become failed command rows before any mutation
 * writes; successful prepared mutations are applied and encoded atomically.
 */

import { applyAccountMutationTx } from '@zerospin/core/contracts/applyAccountMutationTx';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IEncodedAppliedMutation,
  IExecutedAccountCommand,
  IFailedAccountCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { dutils } from '@zerospin/core/utils/dutils';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import { getLastAccountIndex } from '../../getLastAccountCursor/getLastAccountCursor.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';

import { makeAccountBlockTx } from './makeAccountBlockTx.js';
import type { prepareAccountCommands } from './prepareAccountCommands.js';
import { upsertAccountBlockTx } from './upsertAccountBlockTx.js';

/*
 * 1. Resolve account models and start from the current account index.
 * 2. Process service groups and retained blocks in deterministic order.
 * 3. Apply service mutations only to existing service-owned model rows.
 * 4. Emit one commandless AccountBlock per relevant source ServiceBlock.
 * 5. Commit each aligned service watermark at snapshot W.
 * 6. Apply successful command mutations after every old projection reaches W.
 * 7. Allocate authoritative command outcomes after intermediate AccountBlocks.
 * 8. Return the final command block contents to the caller's open transaction.
 */
export const finalizeCommandsTx = Effect.fn('AccountRepo.finalizeCommandsTx')(
  function* (props: {
    accountName: string;
    preparedCommands: Effect.Effect.Success<
      ReturnType<typeof prepareAccountCommands>
    >['preparedCommands'];
    serviceAlignments: Effect.Effect.Success<
      ReturnType<typeof prepareAccountCommands>
    >['serviceAlignments'];
    storage: DurableObjectStorage;
    tx: ITx;
  }): Effect.fn.Return<
    Readonly<{
      executedCommands: readonly IExecutedAccountCommand[];
      failedCommands: readonly IFailedAccountCommand[];
      appliedMutations: readonly IEncodedAppliedMutation[];
    }>,
    IAnyError,
    CuidFactory | MonotonicFactory
  > {
    const { accountName, preparedCommands, serviceAlignments, storage, tx } =
      props;

    // 1 — resolve the account controller once for ownership checks and dynamic model tables
    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });
    let currentAccountIndex = yield* getLastAccountIndex({
      storage,
      defaultValue: 0,
    });
    const executedCommands: IExecutedAccountCommand[] = [];
    const failedCommands: IFailedAccountCommand[] = [];
    const appliedMutations: IEncodedAppliedMutation[] = [];

    // 2 — first-appearance service order is preserved independently of RPC completion order
    for (const serviceAlignment of serviceAlignments) {
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
            accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
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

        // 3 — row existence is replication membership; an absent create does not join early
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

        // 4 — preserve the source ServiceBlock boundary before the later command block
        currentAccountIndex += 1;
        const lastAccountCursor = yield* makeCursor({
          abbreviation: coreAbbreviations.accountCursor,
        });
        const accountBlock = yield* makeAccountBlockTx({
          accountName,
          pushedBlockId: null,
          executedCommands: [],
          failedCommands: [],
          appliedMutations: relevantMutations,
          lastAccountCursor,
          accountIndex: currentAccountIndex,
          storage,
          tx,
        });
        yield* upsertAccountBlockTx({
          accountBlock: {
            ...accountBlock,
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

      // 5 — the one service subscription advances through every processed block, relevant or not
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
              accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
              persistedServiceRepoName,
            ),
          )
          .run();
      }
    }

    // 6 — canonical snapshots join only after every existing service projection has reached its W
    const now = yield* dutils.date();
    for (const preparedCommand of preparedCommands) {
      const { command } = preparedCommand;

      // 7 — intermediate commandless blocks already consumed earlier account positions
      currentAccountIndex += 1;
      const accountCursor = yield* makeCursor({
        abbreviation: coreAbbreviations.accountCursor,
      });
      const maybeMutations = preparedCommand.mutations;

      if (Either.isLeft(maybeMutations)) {
        failedCommands.push({
          ...command,
          accountCursor,
          accountIndex: currentAccountIndex,
          failedAt: now,
          failure: ZerospinError.stringify(maybeMutations.left),
          status: 'failed',
        });
        continue;
      }

      for (const [mutationIndex, mutation] of maybeMutations.right.mutations.entries()) {
        const appliedMutation = yield* applyAccountMutationTx({
          tx,
          mutation,
          commandId: command.id,
          mutationIndex,
          appliedAt: now,
        });
        appliedMutations.push(
          yield* encodeAppliedMutation({ mutation: appliedMutation }),
        );
      }

      executedCommands.push({
        ...command,
        mode: 'authoritative',
        accountCursor,
        accountIndex: currentAccountIndex,
        executedAt: now,
        status: 'executed',
      });
    }

    // 8 — the caller creates the final command AccountBlock after all intermediate rows
    return {
      executedCommands,
      failedCommands,
      appliedMutations,
    };
  },
);
