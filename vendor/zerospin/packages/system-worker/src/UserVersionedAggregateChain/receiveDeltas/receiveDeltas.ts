import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { type userVersionedAggregateRepoDbConfig } from '../../UserVersionedAggregateRepo/userVersionedAggregateRepoDbConfig.js';
import { userVersionedAggregateChainDbConfig } from '../userVersionedAggregateChainDbConfig.js';

/*
 * The replica delta outbox publishes per-command frontend output to UVAC.
 * The receiver commits exact contiguous output bytes before broadcasting;
 * an identical retry may rebroadcast after an earlier commit-before-crash.
 *
 * 1. Decode projected output.
 * 2. Check the output position.
 * 3. Validate any own-origin resolution.
 * 4. Check immutable retry bytes.
 * 5. Require contiguous publication.
 * 6. Retain output before acknowledging delivery.
 * 7. Broadcast committed output, including retries.
 */
export const receiveDeltas = Effect.fn(
  'UserVersionedAggregateChain.receiveDeltas',
)(function* (props: {
  rows: readonly (typeof userVersionedAggregateRepoDbConfig.schema.deltas.$inferSelect)[];
  db: IDb;
  key: {
    aggregateId: string;
    aggregateName: string;
    userId: string;
  };
  broadcast(output: IAggregateFrontendFinalizedCommand): void;
}) {
  for (const row of props.rows) {
    // 1 — read AggregateFrontendFinalizedCommandSchema from row.output
    const output = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
    )(row.output).pipe(
      mapParseError({
        code: 'frontend-output-invalid',
        prefix: 'Failed to decode replica output',
      }),
    );

    // 2 — require userIndex to match the incoming outboxIndex
    if (output.userIndex !== row.outboxIndex) {
      return yield* new ZerospinError({
        code: 'frontend-output-invalid',
        message: 'Output index does not match its command position',
      });
    }
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          // 3 — check aggregate and user identity, command position, and disposition hash
          if (
            output.resolution !== null &&
            (output.resolution.command.aggregateId !== props.key.aggregateId ||
              output.resolution.command.aggregateName !==
                props.key.aggregateName ||
              output.resolution.command.aggregateIndex !==
                output.aggregateIndex ||
              output.resolution.command.dispositionHash === null ||
              output.resolution.command.userId !== props.key.userId)
          ) {
            throw new ZerospinError({
              code: 'frontend-output-resolution-conflict',
              message: 'Output contains a resolution for another view',
            });
          }

          // 4 — accept an identical retained output and reject a conflicting duplicate
          const existing = tx
            .select()
            .from(userVersionedAggregateChainDbConfig.schema.deltas)
            .where(
              eq(
                userVersionedAggregateChainDbConfig.schema.deltas.userIndex,
                row.outboxIndex,
              ),
            )
            .get();
          if (existing !== undefined) {
            if (existing.output !== row.output) {
              throw new ZerospinError({
                code: 'frontend-output-conflict',
                message: 'Repeated output differs from retained bytes',
              });
            }
            return;
          }

          // 5 — append only the next userIndex after the retained tip
          const previous = tx
            .select({
              userIndex:
                userVersionedAggregateChainDbConfig.schema.deltas.userIndex,
              aggregateIndex:
                userVersionedAggregateChainDbConfig.schema.deltas
                  .aggregateIndex,
            })
            .from(userVersionedAggregateChainDbConfig.schema.deltas)
            .orderBy(
              desc(userVersionedAggregateChainDbConfig.schema.deltas.userIndex),
            )
            .limit(1)
            .get();
          const tip = previous?.userIndex ?? 0;
          if (row.outboxIndex !== tip + 1) {
            throw new ZerospinError({
              code: 'frontend-output-index-gap',
              message: `Expected output ${tip + 1}, received ${row.outboxIndex}`,
            });
          }
          if (output.aggregateIndex < (previous?.aggregateIndex ?? 0)) {
            throw new ZerospinError({
              code: 'frontend-output-watermark-regression',
              message: 'Output regresses the consumed aggregate position',
            });
          }

          // 6 — store the original output bytes in the transaction
          tx.insert(userVersionedAggregateChainDbConfig.schema.deltas)
            .values({
              commandId: output.resolution?.command.id ?? null,
              userIndex: row.outboxIndex,
              aggregateIndex: output.aggregateIndex,
              output: row.output,
            })
            .run();
        }),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'frontend-output-commit-failed',
              message: 'Failed to persist replica output',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });
    // Duplicate publication also broadcasts: a prior commit may have preceded a crash.

    // 7 — run after the transaction so a broadcast failure can retry retained bytes
    props.broadcast(output);
  }
});
