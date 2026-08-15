/*
 * System-worker annotation:
 * Stores one finalized block and archives its command/mutation rows.
 */

import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlock } from '../../types.js';
import { aggregateBlockDrizzleSchemas } from '../aggregateBlockDrizzleSchemas.js';

export const publish = Effect.fn('AggregateBlockRepo.publish')(
  function* (props: {
    block: IAggregateBlock;
    db: IDb;
    storage: DurableObjectStorage;
  }) {
    const { block, db, storage } = props;
    const executedCommands = yield* Schema.encode(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedExecutedAggregateCommandSchema,
            ExecutedPushedCommandSchema,
          ),
        ),
      ),
    )(block.executedCommands).pipe(
      mapParseError({
        code: 'aggregate-block-executed-commands-encode-failed',
        prefix: 'Failed to encode executed commands for AggregateBlockRepo',
      }),
    );
    const failedCommands = yield* Schema.encode(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedFailedAggregateCommandSchema,
            FinalizedFailedStagedReplicaCommandSchema,
            FailedPushedCommandSchema,
          ),
        ),
      ),
    )(block.failedCommands).pipe(
      mapParseError({
        code: 'aggregate-block-failed-commands-encode-failed',
        prefix: 'Failed to encode failed commands for AggregateBlockRepo',
      }),
    );
    const appliedMutations = yield* Schema.encode(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(block.appliedMutations).pipe(
      mapParseError({
        code: 'aggregate-block-applied-mutations-encode-failed',
        prefix: 'Failed to encode applied mutations for AggregateBlockRepo',
      }),
    );

    const retained = db
      .select()
      .from(aggregateBlockDrizzleSchemas.finalizedBlocks)
      .where(
        or(
          eq(
            aggregateBlockDrizzleSchemas.finalizedBlocks.aggregateIndex,
            block.aggregateIndex,
          ),
          eq(
            aggregateBlockDrizzleSchemas.finalizedBlocks.lastAggregateCursor,
            block.lastAggregateCursor,
          ),
        ),
      )
      .get();
    if (retained !== undefined) {
      if (
        retained.writeIndex !== block.writeIndex ||
        retained.lastAggregateCursor !== block.lastAggregateCursor ||
        retained.aggregateIndex !== block.aggregateIndex ||
        retained.executedCommands !== executedCommands ||
        retained.failedCommands !== failedCommands ||
        retained.appliedMutations !== appliedMutations
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-block-publish-conflict',
          message: `Aggregate block ${block.aggregateIndex} conflicts with its retained ledger bytes`,
        });
      }
      return;
    }

    yield* makeTx({
      db,
      program: Effect.fn('AggregateBlockRepo.publish.transaction')(function* ({
        tx,
      }) {
        yield* Effect.void;
        tx.insert(aggregateBlockDrizzleSchemas.finalizedBlocks)
          .values({
            writeIndex: block.writeIndex,
            lastAggregateCursor: block.lastAggregateCursor,
            aggregateIndex: block.aggregateIndex,
            executedCommands,
            failedCommands,
            appliedMutations,
          })
          .onConflictDoNothing()
          .run();

        for (const command of block.executedCommands) {
          tx.insert(aggregateBlockDrizzleSchemas.executedCommands)
            .values(command)
            .onConflictDoNothing()
            .run();
        }

        for (const command of block.failedCommands) {
          tx.insert(aggregateBlockDrizzleSchemas.failedCommands)
            .values(command)
            .onConflictDoNothing()
            .run();
        }

        for (const mutation of block.appliedMutations) {
          tx.insert(aggregateBlockDrizzleSchemas.mutations)
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
  },
);
