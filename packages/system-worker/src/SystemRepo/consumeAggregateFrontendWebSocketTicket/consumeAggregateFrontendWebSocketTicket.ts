/*
 * Atomically validates and spends an aggregate frontend WebSocket ticket.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo spends the aggregate frontend ticket during WebSocket upgrade.
 * DELETE RETURNING makes consumption single-use before stored-row validation
 * and expiry checks finish.
 *
 * 1. Check the ticket encoding.
 * 2. Hash the submitted credential.
 * 3. Atomically spend and retrieve the ticket.
 * 4. Reject absent or already spent tickets.
 * 5. Validate the retained target and lock.
 * 6. Reject expired credentials.
 * 7. Return the admitted WebSocket target.
 */
export const consumeAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeAggregateFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateFrontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    aggregateId: AnyColumn;
    aggregateName: AnyColumn;
    aggregateVersion: AnyColumn;
    userId: AnyColumn;
    frontendName: AnyColumn;
    aggregateFrontendLock: AnyColumn;
  }>;
}) {
  const {
    aggregateFrontendWebSocketTicketColumns,
    aggregateFrontendWebSocketTicketTable,
    db,
    ticket,
  } = props;

  // 1 — require exactly 43 base64url characters
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }

  // 2 — compute the same SHA-256 base64url hash used at issuance
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash aggregate frontend WebSocket ticket',
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const now = new Date();

  // 3 — DELETE RETURNING by ticketHash prevents a second successful consumer
  const TicketRowSchema = Schema.Struct({
    repoName: Schema.String,
    aggregateId: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: Schema.String,
    userId: Schema.String,
    frontendName: Schema.String,
    aggregateFrontendLock: Schema.fromJsonString(AggregateFrontendLockSchema),
    expiresAt: Schema.Date,
  });
  const ticketRow = yield* Effect.try({
    try: () =>
      db
        .delete(aggregateFrontendWebSocketTicketTable)
        .where(
          eq(aggregateFrontendWebSocketTicketColumns.ticketHash, ticketHash),
        )
        .returning({
          repoName: aggregateFrontendWebSocketTicketColumns.repoName,
          aggregateId: aggregateFrontendWebSocketTicketColumns.aggregateId,
          aggregateName: aggregateFrontendWebSocketTicketColumns.aggregateName,
          aggregateVersion:
            aggregateFrontendWebSocketTicketColumns.aggregateVersion,
          userId: aggregateFrontendWebSocketTicketColumns.userId,
          frontendName: aggregateFrontendWebSocketTicketColumns.frontendName,
          aggregateFrontendLock:
            aggregateFrontendWebSocketTicketColumns.aggregateFrontendLock,
          expiresAt: aggregateFrontendWebSocketTicketColumns.expiresAt,
        } satisfies Record<keyof typeof TicketRowSchema.Encoded, AnyColumn>)
        .get(),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume aggregate frontend WebSocket ticket',
    }),
  });

  // 4 — return the shared invalid-or-expired ticket failure
  if (ticketRow === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }

  // 5 — decode the stored fields and AggregateFrontendLockSchema
  const decoded = yield* Schema.decodeUnknownEffect(TicketRowSchema)(
    ticketRow,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored aggregate frontend WebSocket ticket is invalid',
    }),
  );

  // 6 — compare expiresAt after consumption; expired tickets remain spent
  if (decoded.expiresAt.getTime() <= now.getTime()) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }

  // 7 — supply retained identity and lock fields to the forwarding path
  return decoded;
});
