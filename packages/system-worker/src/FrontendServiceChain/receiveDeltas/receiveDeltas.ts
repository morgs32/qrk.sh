import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { type frontendVersionedServiceRepoDbConfig } from '../../FrontendVersionedServiceRepo/frontendVersionedServiceRepoDbConfig.js';
import { frontendServiceChainDbConfig } from '../frontendServiceChainDbConfig.js';

/*
 * The replica delta outbox publishes per-command frontend output to FSC.
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
export const receiveDeltas = Effect.fn('FrontendServiceChain.receiveDeltas')(
  function* (props: {
    rows: readonly (typeof frontendVersionedServiceRepoDbConfig.schema.deltas.$inferSelect)[];
    db: IDb;
    key: {
      serviceName: string;
      serviceVersion: string;
      userId: string;
      frontendName: string;
    };
    broadcast(output: IServiceFrontendFinalizedCommand): void;
  }) {
    for (const row of props.rows) {
      // 1 — read ServiceFrontendFinalizedCommandSchema from row.output
      const output = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
      )(row.output).pipe(
        mapParseError({
          code: 'frontend-output-invalid',
          prefix: 'Failed to decode replica output',
        }),
      );

      // 2 — require serviceIndex to match the incoming outboxIndex
      if (output.serviceIndex !== row.outboxIndex) {
        return yield* new ZerospinError({
          code: 'frontend-output-invalid',
          message: 'Output index does not match its command position',
        });
      }
      yield* Effect.try({
        try: () =>
          props.db.transaction(tx => {
            // 3 — preserve the bound service version and terminal occurrence.
            if (
              output.serviceName !== props.key.serviceName ||
              output.serviceVersion !== props.key.serviceVersion ||
              output.delta === null
            ) {
              throw new ZerospinError({
                code: 'service-frontend-output-target-mismatch',
                message: 'Output does not match the bound service version',
              });
            }

            // 4 — accept an identical retained output and reject a conflicting duplicate
            const existing = tx
              .select()
              .from(frontendServiceChainDbConfig.schema.deltas)
              .where(
                eq(
                  frontendServiceChainDbConfig.schema.deltas.serviceIndex,
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

            // 5 — append only the next serviceIndex after the retained tip
            const tip =
              tx
                .select({
                  index:
                    frontendServiceChainDbConfig.schema.deltas.serviceIndex,
                })
                .from(frontendServiceChainDbConfig.schema.deltas)
                .orderBy(
                  desc(frontendServiceChainDbConfig.schema.deltas.serviceIndex),
                )
                .limit(1)
                .get()?.index ?? 0;
            if (row.outboxIndex !== tip + 1) {
              throw new ZerospinError({
                code: 'frontend-output-index-gap',
                message: `Expected output ${tip + 1}, received ${row.outboxIndex}`,
              });
            }

            // 6 — store the original output bytes in the transaction
            tx.insert(frontendServiceChainDbConfig.schema.deltas)
              .values({ serviceIndex: row.outboxIndex, output: row.output })
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
  },
);
