import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import {
  advanceDispositionHash,
  genesisDispositionHash,
} from '../../serviceDispositionHash/serviceDispositionHash.js';
import { type versionedServiceRepoDbConfig } from '../../VersionedServiceRepo/versionedServiceRepoDbConfig.js';
import { versionedServiceChainDbConfig } from '../versionedServiceChainDbConfig.js';
/*
 * The service results outbox hands immutable terminal entries to VSC.
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
export const receiveResults = Effect.fn('VersionedServiceChain.receiveResults')(
  function* (props: {
    db: IDb;
    key: { serviceName: string; serviceVersion: string };
    rows: readonly (typeof versionedServiceRepoDbConfig.schema.results.$inferSelect)[];
  }) {
    for (const row of props.rows) {
      // 1 — read ServiceExecutionEntrySchema from the outbox entry bytes
      const entry = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(ServiceExecutionEntrySchema),
      )(row.entry).pipe(
        mapParseError({
          code: 'finalized-entry-invalid',
          prefix: 'Invalid finalized occurrence',
        }),
      );
      const command = entry.command;

      // 2 — compare outbox position, execution/preparation versions, hash presence, and service target
      if (
        command.serviceIndex !== row.outboxIndex ||
        row.executionVersion !== props.key.serviceVersion ||
        entry.preparationVersion !== props.key.serviceVersion ||
        command.dispositionHash === null ||
        command.serviceName !== props.key.serviceName
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
              .from(versionedServiceChainDbConfig.schema.commands)
              .where(
                eq(
                  versionedServiceChainDbConfig.schema.commands.outboxIndex,
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
              .from(versionedServiceChainDbConfig.schema.commands)
              .orderBy(
                desc(versionedServiceChainDbConfig.schema.commands.outboxIndex),
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
                    Schema.fromJsonString(ServiceExecutionEntrySchema),
                  )(tip.entry).command.dispositionHash;
            if (
              previous === null ||
              command.dispositionHash !==
                advanceDispositionHash({
                  previousDispositionHash: previous,
                  serviceIndex: row.outboxIndex,
                  commandId: command.id,
                  disposition:
                    command.failedAt === null ? 'success' : 'failure',
                })
            ) {
              throw new ZerospinError({
                code: 'finalized-entry-hash-mismatch',
                message:
                  'Finalized disposition hash does not extend retained history',
              });
            }

            // 6 — persist the original bytes and executionVersion before returning
            tx.insert(versionedServiceChainDbConfig.schema.commands)
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
  },
);
