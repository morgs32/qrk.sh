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
import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { ActorDeltaSchema } from '../../blockSchemas.js';
import type { IActorBlock } from '../../types.js';
import { actorBlockDrizzleSchemas } from '../ActorBlockRepo.js';

export const storeActorBlocks = Effect.fn('ActorBlockRepo.storeActorBlocks')(
  function* (props: { blocks: readonly IActorBlock[]; db: IDb }) {
    const { blocks, db } = props;
    if (blocks.length === 0) {
      return;
    }
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
              .onConflictDoNothing()
              .run();
          }
        },
      ),
    });
  },
);
