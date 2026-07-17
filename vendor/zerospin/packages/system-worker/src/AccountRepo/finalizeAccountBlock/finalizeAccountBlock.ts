/*
 * System-worker annotation:
 * Finalizes account commands into an AccountRepo block, stores the pre-publish
 * outbox row transactionally. The AccountRepo boundary drains the outbox after
 * this Effect commits.
 */

import type { Async } from '@zerospin/core/async/Async';
import type { IAccountCommand } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAccountBlockOutboxRecord } from '../../types.js';

import { finalizeCommandsTx } from './finalizeCommandsTx.js';
import { makeAccountBlockTx } from './makeAccountBlockTx.js';
import { prepareAccountCommands } from './prepareAccountCommands.js';
import { upsertAccountBlockTx } from './upsertAccountBlockTx.js';

export const finalizeAccountBlock = Effect.fn(
  'AccountRepo.finalizeAccountBlock',
)(function* (props: {
  generationId: string;
  accountId: string;
  accountName: string;
  commands: readonly IAccountCommand[];
  db: IDb;
  storage: DurableObjectStorage;
}): Effect.fn.Return<
  IAccountBlockOutboxRecord,
  IAnyError,
  Async | CuidFactory | MonotonicFactory
> {
  const { generationId, accountName, commands, db, storage } = props;

  if (commands.length === 0) {
    return yield* new ZerospinError({
      code: 'no-commands-provided',
      message: 'No commands provided',
    });
  }

  const preparation = yield* prepareAccountCommands({
    generationId,
    accountName,
    commands,
    db,
  });

  const accountBlock = yield* makeTx({
    db,
    program: Effect.fn('AccountRepo.finalizeAccountBlock.transaction')(
      function* ({ tx }) {
        const finalization = yield* finalizeCommandsTx({
          accountName,
          preparedCommands: preparation.preparedCommands,
          serviceAlignments: preparation.serviceAlignments,
          storage,
          tx,
        });
        const accountBlock = yield* makeAccountBlockTx({
          accountName,
          pushedBlockId: null,
          executedCommands: finalization.executedCommands,
          failedCommands: finalization.failedCommands,
          appliedMutations: finalization.appliedMutations,
          storage,
          tx,
        });
        const accountBlockOutboxRecord = {
          ...accountBlock,
          failure: null,
          publishedAt: null,
        } satisfies IAccountBlockOutboxRecord;
        yield* upsertAccountBlockTx({
          accountBlock: accountBlockOutboxRecord,
          tx,
        });
        return accountBlockOutboxRecord;
      },
    ),
  });
  return accountBlock;
});
