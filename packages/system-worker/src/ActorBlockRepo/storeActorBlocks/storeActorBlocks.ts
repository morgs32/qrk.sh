/* Stores pure actor blocks. Frontend projection and delivery live downstream. */

import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlock } from '../../types.js';
import { actorBlockDrizzleSchemas } from '../ActorBlockRepo.js';

export const storeActorBlocks = Effect.fn('ActorBlockRepo.storeActorBlocks')(
  function* (props: {
    blocks: readonly IActorBlock[];
    db: IDb;
  }): Effect.fn.Return<void, IAnyError> {
    const { blocks, db } = props;
    if (blocks.length === 0) {
      return;
    }
    let conflictingDuplicate: IAnyError | null = null;
    yield* makeTx({
      db,
      program: Effect.fn('ActorBlockRepo.storeActorBlocks.transaction')(
        function* ({ tx }) {
          yield* Effect.void;
          for (const block of blocks) {
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
                code: 'actor-block-executed-commands-encode-failed',
                prefix: 'Failed to encode actor block executed commands',
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
                code: 'actor-block-failed-commands-encode-failed',
                prefix: 'Failed to encode actor block failed commands',
              }),
            );
            const appliedMutations = yield* Schema.encode(
              Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
            )(block.appliedMutations).pipe(
              mapParseError({
                code: 'actor-block-applied-mutations-encode-failed',
                prefix: 'Failed to encode actor block mutations',
              }),
            );
            const deltas = yield* Schema.encode(
              Schema.parseJson(
                Schema.Record({ key: Schema.String, value: ActorDeltaSchema }),
              ),
            )(block.deltas).pipe(
              mapParseError({
                code: 'actor-block-deltas-encode-failed',
                prefix: 'Failed to encode actor block deltas',
              }),
            );
            // Both lastAccountCursor and accountIndex are unique. A retry is
            // idempotent only when the one stored row is byte-for-byte equal
            // across every persisted column; either key colliding with
            // different content is an archive conflict, not success.
            const existingRows = tx
              .select()
              .from(actorBlockDrizzleSchemas.actorBlocks)
              .where(
                or(
                  eq(
                    actorBlockDrizzleSchemas.actorBlocks.lastAccountCursor,
                    block.lastAccountCursor,
                  ),
                  eq(
                    actorBlockDrizzleSchemas.actorBlocks.accountIndex,
                    block.accountIndex,
                  ),
                ),
              )
              .all();
            if (existingRows.length > 0) {
              const existing = existingRows[0];
              if (
                existingRows.length === 1 &&
                existing !== undefined &&
                existing.pushedBlockId === block.pushedBlockId &&
                existing.lastAccountCursor === block.lastAccountCursor &&
                existing.accountIndex === block.accountIndex &&
                existing.executedCommands === executedCommands &&
                existing.failedCommands === failedCommands &&
                existing.appliedMutations === appliedMutations &&
                existing.deltas === deltas
              ) {
                continue;
              }

              conflictingDuplicate = new ZerospinError({
                code: 'actor-block-conflicting-duplicate',
                message:
                  'Actor block cursor or account index already exists with different canonical content',
                extra: {
                  lastAccountCursor: block.lastAccountCursor,
                  accountIndex: block.accountIndex,
                },
              });
              return yield* conflictingDuplicate;
            }

            tx.insert(actorBlockDrizzleSchemas.actorBlocks)
              .values({
                pushedBlockId: block.pushedBlockId,
                lastAccountCursor: block.lastAccountCursor,
                accountIndex: block.accountIndex,
                executedCommands,
                failedCommands,
                appliedMutations,
                deltas,
              })
              .run();
          }
        },
      ),
    }).pipe(
      Effect.catchAll(error =>
        Effect.fail(
          conflictingDuplicate === null ? error : conflictingDuplicate,
        ),
      ),
    );
  },
);
