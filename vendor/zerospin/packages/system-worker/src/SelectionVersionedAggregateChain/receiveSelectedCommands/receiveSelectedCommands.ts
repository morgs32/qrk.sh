import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateSelectedCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import type { IAggregateSelectedCommand } from '@zerospin/core/session/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { type selectionVersionedAggregateRepoDbConfig } from '../../SelectionVersionedAggregateRepo/selectionVersionedAggregateRepoDbConfig.js';
import { selectionVersionedAggregateChainDbConfig } from '../selectionVersionedAggregateChainDbConfig.js';

/*
 * The replica delta outbox publishes per-command frontend output to SelectionVAC.
 * The receiver commits exact contiguous output bytes before broadcasting;
 * an identical retry may rebroadcast after an earlier commit-before-crash.
 *
 * 1. Decode projected output.
 * 2. Check the output position.
 * 3. Validate any private completion owner.
 * 4. Check immutable retry bytes.
 * 5. Require contiguous publication.
 * 6. Retain output before acknowledging delivery.
 * 7. Broadcast committed output, including retries.
 */
export const receiveSelectedCommands = Effect.fn(
  'SelectionVersionedAggregateChain.receiveSelectedCommands',
)(function* (props: {
  rows: readonly (typeof selectionVersionedAggregateRepoDbConfig.schema.selectedCommands.$inferSelect)[];
  db: IDb;
  broadcast(props: {
    command: IAggregateSelectedCommand;
    authentication: Readonly<Record<string, unknown>> | null;
    frontendName: string | null;
  }): void;
}) {
  for (const row of props.rows) {
    // 1 — read AggregateSelectedCommandSchema from row.output
    const output = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateSelectedCommandSchema),
    )(row.output).pipe(
      mapParseError({
        code: 'frontend-output-invalid',
        prefix: 'Failed to decode replica output',
      }),
    );
    const authentication = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
      ),
    )(row.authentication).pipe(
      mapParseError({
        code: 'frontend-output-completion-owner-invalid',
        prefix: 'Failed to decode selected command owner',
      }),
    );

    // 2 — require selectionIndex to match the incoming outboxIndex
    if (output.selectionIndex !== row.outboxIndex) {
      return yield* new ZerospinError({
        code: 'frontend-output-invalid',
        message: 'Output index does not match its command position',
      });
    }
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          // 3 — require completion ownership to be complete and private.
          if (
            (authentication === null) !== (row.frontendName === null) ||
            (output.failure !== null && authentication === null)
          ) {
            throw new ZerospinError({
              code: 'frontend-output-completion-owner-invalid',
              message: 'Selected command has invalid completion ownership',
            });
          }

          // 4 — accept an identical retained output and reject a conflicting duplicate
          const existing = tx
            .select()
            .from(selectionVersionedAggregateChainDbConfig.schema.commands)
            .where(
              eq(
                selectionVersionedAggregateChainDbConfig.schema.commands
                  .selectionIndex,
                row.outboxIndex,
              ),
            )
            .get();
          if (existing !== undefined) {
            if (
              existing.output !== row.output ||
              existing.frontendName !== row.frontendName ||
              existing.authentication !== row.authentication
            ) {
              throw new ZerospinError({
                code: 'frontend-output-conflict',
                message: 'Repeated output differs from retained bytes',
              });
            }
            return;
          }

          // 5 — append only the next selectionIndex after the retained tip
          const previous = tx
            .select({
              selectionIndex:
                selectionVersionedAggregateChainDbConfig.schema.commands
                  .selectionIndex,
              aggregateIndex:
                selectionVersionedAggregateChainDbConfig.schema.commands
                  .aggregateIndex,
            })
            .from(selectionVersionedAggregateChainDbConfig.schema.commands)
            .orderBy(
              desc(
                selectionVersionedAggregateChainDbConfig.schema.commands
                  .selectionIndex,
              ),
            )
            .limit(1)
            .get();
          const tip = previous?.selectionIndex ?? 0;
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
          tx.insert(selectionVersionedAggregateChainDbConfig.schema.commands)
            .values({
              commandId: output.id,
              selectionIndex: row.outboxIndex,
              selectionHash: output.selectionHash,
              aggregateIndex: output.aggregateIndex,
              output: row.output,
              authentication: row.authentication,
              frontendName: row.frontendName,
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
    props.broadcast({
      command: output,
      authentication,
      frontendName: row.frontendName,
    });
  }
});
