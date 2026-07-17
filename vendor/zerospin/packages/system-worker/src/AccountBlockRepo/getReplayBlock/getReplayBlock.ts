import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAccountBlock } from '../../types.js';
import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

/** Reads exactly the next account block inside a previously captured bound. */
export const getReplayBlock = Effect.fn('AccountBlockRepo.getReplayBlock')(
  function* (props: {
    afterAccountIndex: number | null;
    throughAccountIndex: number;
    db: IDb;
  }): Effect.fn.Return<IAccountBlock | null, IAnyError> {
    const { afterAccountIndex, throughAccountIndex, db } = props;

    // 1 — reject malformed bounds before they can select an ambiguous block.
    if (!Number.isInteger(throughAccountIndex)) {
      return yield* new ZerospinError({
        code: 'account-replay-through-index-invalid',
        message: `Account replay throughAccountIndex must be an integer, received ${throughAccountIndex}`,
      });
    }
    if (afterAccountIndex !== null && !Number.isInteger(afterAccountIndex)) {
      return yield* new ZerospinError({
        code: 'account-replay-after-index-invalid',
        message: `Account replay afterAccountIndex must be null or an integer, received ${afterAccountIndex}`,
      });
    }

    // 2 — select only the lowest block in the half-open/closed range (after, through].
    const row =
      afterAccountIndex === null
        ? db
            .select()
            .from(accountBlockDrizzleSchemas.finalizedBlocks)
            .where(
              lte(
                accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
                throughAccountIndex,
              ),
            )
            .orderBy(
              asc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
            )
            .limit(1)
            .get()
        : db
            .select()
            .from(accountBlockDrizzleSchemas.finalizedBlocks)
            .where(
              and(
                gt(
                  accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
                  afterAccountIndex,
                ),
                lte(
                  accountBlockDrizzleSchemas.finalizedBlocks.accountIndex,
                  throughAccountIndex,
                ),
              ),
            )
            .orderBy(
              asc(accountBlockDrizzleSchemas.finalizedBlocks.accountIndex),
            )
            .limit(1)
            .get();
    if (row === undefined) {
      return null;
    }

    // 3 — decode each archived JSON column without rebuilding command fields.
    const executedCommands = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedExecutedAccountCommandSchema,
            ExecutedPushedCommandSchema,
          ),
        ),
      ),
    )(row.executedCommands).pipe(
      mapParseError({
        code: 'account-replay-executed-commands-decode-failed',
        prefix: `Failed to decode AccountBlockRepo replay block executed commands at index ${row.accountIndex}`,
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
    )(row.failedCommands).pipe(
      mapParseError({
        code: 'account-replay-failed-commands-decode-failed',
        prefix: `Failed to decode AccountBlockRepo replay block failed commands at index ${row.accountIndex}`,
      }),
    );
    const appliedMutations = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(row.appliedMutations).pipe(
      mapParseError({
        code: 'account-replay-applied-mutations-decode-failed',
        prefix: `Failed to decode AccountBlockRepo replay block mutations at index ${row.accountIndex}`,
      }),
    );

    // 4 — return the exact full command block and duplicated row watermark.
    return {
      pushedBlockId: row.pushedBlockId,
      lastAccountCursor: row.lastAccountCursor,
      accountIndex: row.accountIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
    };
  },
);
