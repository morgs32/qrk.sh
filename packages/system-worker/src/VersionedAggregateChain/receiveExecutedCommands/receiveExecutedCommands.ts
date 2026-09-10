import { AggregateExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { type versionedAggregateRepoDbConfig } from '../../VersionedAggregateRepo/versionedAggregateRepoDbConfig.js';
import { versionedAggregateChainDbConfig } from '../versionedAggregateChainDbConfig.js';
/*
 * The aggregate executedCommands outbox hands immutable terminal entries to VAC.
 * This receiver retains contiguous version-owned history before acknowledgement
 * and verifies that each disposition hash extends the retained prefix.
 *
 * 1. Decode each terminal execution entry.
 * 2. Check version and occurrence identity.
 * 3. Check duplicate publication inside the transaction.
 * 4. Require contiguous append position.
 * 5. Verify the rolling disposition hash.
 * 6. Retain the complete version-owned entry.
 * 7. Classify publication commit failures.
 */
export const receiveExecutedCommands = Effect.fn(
  'VersionedAggregateChain.receiveExecutedCommands',
)(function* (props: {
  db: IDb;
  key: { aggregateId: string; aggregateName: string; aggregateVersion: string };
  rows: readonly (typeof versionedAggregateRepoDbConfig.schema.executedCommands.$inferSelect)[];
}) {
  for (const row of props.rows) {
    // 1 — read AggregateExecutionEntrySchema from the outbox entry bytes
    const entry = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateExecutionEntrySchema),
    )(row.entry).pipe(
      mapParseError({
        code: 'finalized-entry-invalid',
        prefix: 'Invalid finalized occurrence',
      }),
    );
    const command = entry.command;

    // 2 — compare outbox position, execution/preparation versions, hash presence, and aggregate target
    if (
      command.aggregateIndex !== row.outboxIndex ||
      row.executionVersion !== props.key.aggregateVersion ||
      entry.preparationVersion !== props.key.aggregateVersion ||
      command.dispositionHash === null ||
      (!('serviceName' in command) &&
        (command.aggregateId !== props.key.aggregateId ||
          command.aggregateName !== props.key.aggregateName))
    ) {
      return yield* new ZerospinError({
        code: 'finalized-entry-target-mismatch',
        message:
          'Finalized occurrence does not belong to this versioned history',
      });
    }
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          // 3 — require exact retained entry bytes and executionVersion
          const existing = tx
            .select()
            .from(versionedAggregateChainDbConfig.schema.commands)
            .where(
              eq(
                versionedAggregateChainDbConfig.schema.commands.outboxIndex,
                row.outboxIndex,
              ),
            )
            .get();
          if (existing) {
            if (
              existing.entry !== row.entry ||
              existing.executionVersion !== row.executionVersion
            ) {
              throw new ZerospinError({
                code: 'finalized-entry-conflict',
                message: 'Finalized history is immutable',
              });
            }
            return;
          }

          // 4 — accept only the next outboxIndex after retained history
          const tip = tx
            .select()
            .from(versionedAggregateChainDbConfig.schema.commands)
            .orderBy(
              desc(versionedAggregateChainDbConfig.schema.commands.outboxIndex),
            )
            .limit(1)
            .get();
          if (row.outboxIndex !== (tip?.outboxIndex ?? 0) + 1) {
            throw new ZerospinError({
              code: 'finalized-entry-gap',
              message: 'Finalized history must be contiguous',
            });
          }

          // 5 — extend the preceding hash using command ID, position, and success/failure
          const previous =
            tip === undefined
              ? genesisDispositionHash()
              : Schema.decodeUnknownSync(
                  Schema.fromJsonString(AggregateExecutionEntrySchema),
                )(tip.entry).command.dispositionHash;
          if (
            previous === null ||
            command.dispositionHash !==
              advanceDispositionHash({
                previousDispositionHash: previous,
                aggregateIndex: row.outboxIndex,
                commandId: command.id,
                disposition: command.failedAt === null ? 'success' : 'failure',
              })
          ) {
            throw new ZerospinError({
              code: 'finalized-entry-hash-mismatch',
              message:
                'Finalized disposition hash does not extend retained history',
            });
          }

          // 6 — persist the original bytes and executionVersion before returning
          tx.insert(versionedAggregateChainDbConfig.schema.commands)
            .values({
              outboxIndex: row.outboxIndex,
              entry: row.entry,
              executionVersion: row.executionVersion,
            })
            .run();
        }),

      // 7 — preserve conflicts, gaps, and hash failures; wrap unexpected transaction errors
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'finalized-entry-commit-failed',
              message: 'Failed to persist finalized occurrence',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });
  }
});
