/*
 * System-worker annotation:
 * Upserts the pre-publish AccountRepo account block row through an open
 * finalization transaction.
 */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { ITx } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAccountBlockOutboxRecord } from '../../types.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';

export const upsertAccountBlockTx = Effect.fn(
  'AccountRepo.upsertAccountBlockTx',
)(function* (props: {
  accountBlock: IAccountBlockOutboxRecord;
  tx: ITx;
}): Effect.fn.Return<void, IAnyError> {
  const { accountBlock, tx } = props;
  const executedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedExecutedAccountCommandSchema,
          ExecutedPushedCommandSchema,
        ),
      ),
    ),
  )(accountBlock.executedCommands).pipe(
    mapParseError({
      code: 'account-repo-outbox-executed-commands-encode-failed',
      prefix: 'Failed to encode executed commands for AccountRepo outbox row',
    }),
  );
  const failedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedFailedAccountCommandSchema,
          FailedPushedCommandSchema,
        ),
      ),
    ),
  )(accountBlock.failedCommands).pipe(
    mapParseError({
      code: 'account-repo-outbox-failed-commands-encode-failed',
      prefix: 'Failed to encode failed commands for AccountRepo outbox row',
    }),
  );
  const appliedMutations = yield* Schema.encode(
    Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
  )(accountBlock.appliedMutations).pipe(
    mapParseError({
      code: 'account-repo-outbox-applied-mutations-encode-failed',
      prefix: 'Failed to encode applied mutations for AccountRepo outbox row',
    }),
  );
  const failure = yield* Schema.encode(
    Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
  )(accountBlock.failure).pipe(
    mapParseError({
      code: 'account-repo-outbox-publish-failure-encode-failed',
      prefix: 'Failed to encode AccountRepo outbox publish failure',
    }),
  );

  tx.insert(accountRepoDrizzleSchemas.accountBlockOutbox)
    .values({
      pushedBlockId: accountBlock.pushedBlockId,
      lastAccountCursor: accountBlock.lastAccountCursor,
      accountIndex: accountBlock.accountIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
      publishedAt: accountBlock.publishedAt,
      failure,
    })
    .onConflictDoUpdate({
      target: accountRepoDrizzleSchemas.accountBlockOutbox.lastAccountCursor,
      set: {
        pushedBlockId: sql`excluded.pushedBlockId`,
        accountIndex: sql`excluded.accountIndex`,
        executedCommands: sql`excluded.executedCommands`,
        failedCommands: sql`excluded.failedCommands`,
        appliedMutations: sql`excluded.appliedMutations`,
        publishedAt: sql`excluded.publishedAt`,
        failure: sql`excluded.failure`,
      },
    })
    .run();
});
