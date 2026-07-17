/*
 * System-worker annotation:
 * Builds the flat AccountRepo outbox block row inside the finalization
 * transaction and advances the account cursor to the row cursor.
 */

import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IEncodedAppliedMutation,
  IExecutedAccountCommand,
  IFailedAccountCommand,
} from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import {
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import type { IAccountBlock } from '../../types.js';

export const makeAccountBlockTx = Effect.fn('AccountRepo.makeAccountBlockTx')(
  function* (props: {
    accountName: string;
    pushedBlockId: IAccountBlock['pushedBlockId'];
    executedCommands: readonly IExecutedAccountCommand[];
    failedCommands: readonly IFailedAccountCommand[];
    appliedMutations: readonly IEncodedAppliedMutation[];
    lastAccountCursor?: IAccountCursor;
    accountIndex?: number;
    storage: DurableObjectStorage;
    tx: ITx;
  }): Effect.fn.Return<IAccountBlock, IAnyError> {
    const {
      accountName,
      pushedBlockId,
      appliedMutations,
      failedCommands,
      executedCommands,
      lastAccountCursor: providedLastAccountCursor,
      accountIndex: providedAccountIndex,
      storage,
      tx,
    } = props;
    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });

    let lastAccountCursor: IAccountCursor | null =
      providedLastAccountCursor ?? null;
    let accountIndex: number | null = providedAccountIndex ?? null;

    if (
      (providedLastAccountCursor === undefined) !==
      (providedAccountIndex === undefined)
    ) {
      return yield* new ZerospinError({
        code: 'account-block-explicit-watermark-incomplete',
        message:
          'Explicit AccountBlock creation requires both lastAccountCursor and accountIndex',
      });
    }

    for (const command of executedCommands) {
      if (accountIndex === null || command.accountIndex > accountIndex) {
        lastAccountCursor = command.accountCursor;
        accountIndex = command.accountIndex;
      }
    }
    for (const command of failedCommands) {
      if (accountIndex === null || command.accountIndex > accountIndex) {
        lastAccountCursor = command.accountCursor;
        accountIndex = command.accountIndex;
      }
    }

    if (lastAccountCursor === null || accountIndex === null) {
      return yield* new ZerospinError({
        code: 'account-block-has-no-command-rows',
        message:
          'Cannot make an AccountRepo block with no executed or failed commands',
      });
    }

    const encodedExecutedCommands = yield* Effect.forEach(
      executedCommands,
      command =>
        Effect.gen(function* () {
          const contract = yield* getByKeyOrThrow({
            record: accountController.contracts,
            key: command.commandName,
            recordKind: 'account contracts',
          });
          return yield* encodeCommand({
            contract,
            command,
          });
        }),
    );
    const encodedFailedCommands = yield* Effect.forEach(
      failedCommands,
      command =>
        Effect.gen(function* () {
          const contract = yield* getByKeyOrThrow({
            record: accountController.contracts,
            key: command.commandName,
            recordKind: 'account contracts',
          });
          return yield* encodeCommand({
            contract,
            command,
          });
        }),
    );
    const accountBlock = {
      pushedBlockId,
      lastAccountCursor,
      accountIndex,
      executedCommands: encodedExecutedCommands,
      failedCommands: encodedFailedCommands,
      appliedMutations,
    } satisfies IAccountBlock;

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

    return accountBlock;
  },
);
