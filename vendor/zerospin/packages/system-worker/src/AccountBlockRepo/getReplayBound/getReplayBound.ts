import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { desc } from 'drizzle-orm';
import { Effect } from 'effect';

import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

/** Reads the immutable terminal account-ledger watermark captured after drain. */
export const getReplayBound = Effect.fn('AccountBlockRepo.getReplayBound')(
  function* (props: {
    db: IDb;
  }): Effect.fn.Return<
    Readonly<{
      lastAccountCursor: IAccountCursor | null;
      accountIndex: number | null;
    }>,
    IAnyError
  > {
    const { db } = props;

    // 1 — the greatest persisted block index is the replay terminal bound.
    const row = db
      .select({
        lastAccountCursor:
          accountBlockDrizzleSchemas.finalizedBlocks.lastAccountCursor,
        accountIndex: accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
      })
      .from(accountBlockDrizzleSchemas.finalizedBlocks)
      .orderBy(
        desc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
      )
      .limit(1)
      .get();

    // 2 — an empty ledger is represented only by the paired null watermark.
    const lastAccountCursor = row?.lastAccountCursor ?? null;
    const accountIndex = row?.accountIndex ?? null;
    if ((lastAccountCursor === null) !== (accountIndex === null)) {
      return yield* new ZerospinError({
        code: 'account-replay-bound-watermark-incomplete',
        message:
          'AccountBlockRepo replay bound requires cursor and index to both be null or both be present',
      });
    }
    if (accountIndex !== null && !Number.isInteger(accountIndex)) {
      return yield* new ZerospinError({
        code: 'account-replay-bound-index-invalid',
        message: `AccountBlockRepo replay bound index must be an integer, received ${accountIndex}`,
      });
    }

    // 3 — callers perform no block reads when both values are null.
    return { lastAccountCursor, accountIndex };
  },
);
