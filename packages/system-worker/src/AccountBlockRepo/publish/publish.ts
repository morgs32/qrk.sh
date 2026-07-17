/*
 * System-worker annotation:
 * Stores one finalized block and archives its command/mutation rows.
 */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IAccountBlock } from '../../types.js';
import { accountBlockDrizzleSchemas } from '../accountBlockDrizzleSchemas.js';

export const publish = Effect.fn('AccountBlockRepo.publish')(function* (props: {
  block: IAccountBlock;
  db: IDb;
  storage: DurableObjectStorage;
}) {
  const { block, db, storage } = props;
  const executedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedExecutedAccountCommandSchema,
          ExecutedPushedCommandSchema,
        ),
      ),
    ),
  )(block.executedCommands).pipe(
    mapParseError({
      code: 'account-block-executed-commands-encode-failed',
      prefix: 'Failed to encode executed commands for AccountBlockRepo',
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
  )(block.failedCommands).pipe(
    mapParseError({
      code: 'account-block-failed-commands-encode-failed',
      prefix: 'Failed to encode failed commands for AccountBlockRepo',
    }),
  );
  const appliedMutations = yield* Schema.encode(
    Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
  )(block.appliedMutations).pipe(
    mapParseError({
      code: 'account-block-applied-mutations-encode-failed',
      prefix: 'Failed to encode applied mutations for AccountBlockRepo',
    }),
  );

  yield* makeTx({
    db,
    program: Effect.fn('AccountBlockRepo.publish.transaction')(function* ({
      tx,
    }) {
      yield* Effect.void;
      tx.insert(accountBlockDrizzleSchemas.finalizedBlocks)
        .values({
          pushedBlockId: block.pushedBlockId,
          lastAccountCursor: block.lastAccountCursor,
          accountIndex: block.accountIndex,
          executedCommands,
          failedCommands,
          appliedMutations,
        })
        .onConflictDoNothing()
        .run();

      for (const command of block.executedCommands) {
        tx.insert(accountBlockDrizzleSchemas.executedCommands)
          .values(command)
          .onConflictDoNothing()
          .run();
      }

      for (const command of block.failedCommands) {
        tx.insert(accountBlockDrizzleSchemas.failedCommands)
          .values(command)
          .onConflictDoNothing()
          .run();
      }

      for (const mutation of block.appliedMutations) {
        tx.insert(accountBlockDrizzleSchemas.mutations)
          .values(mutation)
          .onConflictDoNothing()
          .run();
      }
    }),
  });

  const span = yield* Effect.currentSpan.pipe(Effect.orDie);
  yield* Effect.promise(() =>
    storage.put('telemetryDrainCausedBy', {
      traceId: span.traceId,
      spanId: span.spanId,
    }),
  ).pipe(Effect.catchAllCause(() => Effect.void));
});
