/*
 * System-worker annotation:
 * Upserts the post-publish AggregateRepo aggregate block row, encoding JSON columns
 * for SQLite storage outside the finalization transaction.
 */

import {
  EncodedExecutedAggregateCommandSchema,
  EncodedFailedAggregateCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { IAggregateBlockOutboxRecord } from '../../types.js';
import { aggregateRepoDrizzleSchemas } from '../AggregateRepo.js';

export const upsertAggregateBlock = Effect.fn(
  'AggregateRepo.upsertAggregateBlock',
)(function* (props: {
  aggregateBlock: IAggregateBlockOutboxRecord;
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const { aggregateBlock, db } = props;
  const executedCommands = yield* Schema.encode(
    Schema.parseJson(
      Schema.Array(
        Schema.Union(
          EncodedExecutedAggregateCommandSchema,
          ExecutedPushedCommandSchema,
        ),
      ),
    ),
  )(aggregateBlock.executedCommands).pipe(
    mapParseError({
      code: 'aggregate-repo-outbox-executed-commands-encode-failed',
      prefix: 'Failed to encode executed commands for AggregateRepo outbox row',
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
  )(aggregateBlock.failedCommands).pipe(
    mapParseError({
      code: 'aggregate-repo-outbox-failed-commands-encode-failed',
      prefix: 'Failed to encode failed commands for AggregateRepo outbox row',
    }),
  );
  const appliedMutations = yield* Schema.encode(
    Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
  )(aggregateBlock.appliedMutations).pipe(
    mapParseError({
      code: 'aggregate-repo-outbox-applied-mutations-encode-failed',
      prefix: 'Failed to encode applied mutations for AggregateRepo outbox row',
    }),
  );
  const failure = yield* Schema.encode(
    Schema.NullOr(Schema.parseJson(ZerospinError.schema)),
  )(aggregateBlock.failure).pipe(
    mapParseError({
      code: 'aggregate-repo-outbox-publish-failure-encode-failed',
      prefix: 'Failed to encode AggregateRepo outbox publish failure',
    }),
  );

  db.insert(aggregateRepoDrizzleSchemas.aggregateBlockOutbox)
    .values({
      writeIndex: aggregateBlock.writeIndex,
      lastAggregateCursor: aggregateBlock.lastAggregateCursor,
      aggregateIndex: aggregateBlock.aggregateIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
      publishedAt: aggregateBlock.publishedAt,
      failure,
    })
    .onConflictDoUpdate({
      target:
        aggregateRepoDrizzleSchemas.aggregateBlockOutbox.lastAggregateCursor,
      set: {
        writeIndex: sql`excluded.writeIndex`,
        aggregateIndex: sql`excluded.aggregateIndex`,
        executedCommands: sql`excluded.executedCommands`,
        failedCommands: sql`excluded.failedCommands`,
        appliedMutations: sql`excluded.appliedMutations`,
        publishedAt: sql`excluded.publishedAt`,
        failure: sql`excluded.failure`,
      },
    })
    .run();
});
