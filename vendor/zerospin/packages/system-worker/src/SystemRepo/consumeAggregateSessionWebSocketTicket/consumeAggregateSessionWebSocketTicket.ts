/*
 * Atomically validates and spends an aggregate definition WebSocket ticket.
 */

import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo spends the aggregate definition ticket during WebSocket upgrade.
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
export const consumeAggregateSessionWebSocketTicket = Effect.fn(
  'SystemRepo.consumeAggregateSessionWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  aggregateSessionWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateSessionWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    aggregateId: AnyColumn;
    aggregateName: AnyColumn;
    aggregateVersion: AnyColumn;
    actorPath: AnyColumn;
    actorName: AnyColumn;
    actorVersion: AnyColumn;
    identity: AnyColumn;
    sessionName: AnyColumn;
    aggregateSessionLock: AnyColumn;
  }>;
}) {
  const {
    aggregateSessionWebSocketTicketColumns,
    aggregateSessionWebSocketTicketTable,
    db,
    ticket,
  } = props;

  // 1 — require exactly 43 base64url characters
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-websocket-ticket-invalid',
        message: 'Aggregate definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 2 — compute the same SHA-256 base64url hash used at issuance
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: catchZerospinError({
      code: 'aggregate-session-websocket-ticket-hash-failed',
      message: 'Failed to hash aggregate definition WebSocket ticket',
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
    actorPath: Schema.String,
    actorName: Schema.String,
    actorVersion: Schema.String,
    identity: Schema.fromJsonString(
      Schema.Record(Schema.String, Schema.Unknown),
    ),
    sessionName: Schema.String,
    aggregateSessionLock: Schema.fromJsonString(AggregateSessionLockSchema),
    expiresAt: Schema.Date,
  });
  const ticketRow = yield* Effect.try({
    try: () =>
      db
        .delete(aggregateSessionWebSocketTicketTable)
        .where(
          eq(aggregateSessionWebSocketTicketColumns.ticketHash, ticketHash),
        )
        .returning({
          repoName: aggregateSessionWebSocketTicketColumns.repoName,
          aggregateId: aggregateSessionWebSocketTicketColumns.aggregateId,
          aggregateName: aggregateSessionWebSocketTicketColumns.aggregateName,
          aggregateVersion:
            aggregateSessionWebSocketTicketColumns.aggregateVersion,
          actorPath: aggregateSessionWebSocketTicketColumns.actorPath,
          actorName: aggregateSessionWebSocketTicketColumns.actorName,
          actorVersion: aggregateSessionWebSocketTicketColumns.actorVersion,
          identity: aggregateSessionWebSocketTicketColumns.identity,
          sessionName: aggregateSessionWebSocketTicketColumns.sessionName,
          aggregateSessionLock:
            aggregateSessionWebSocketTicketColumns.aggregateSessionLock,
          expiresAt: aggregateSessionWebSocketTicketColumns.expiresAt,
        } satisfies Record<keyof typeof TicketRowSchema.Encoded, AnyColumn>)
        .get(),
    catch: catchZerospinError({
      code: 'aggregate-session-websocket-ticket-consume-failed',
      message: 'Failed to consume aggregate definition WebSocket ticket',
    }),
  });

  // 4 — return the shared invalid-or-expired ticket failure
  if (ticketRow === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-websocket-ticket-invalid',
        message: 'Aggregate definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 5 — decode the stored fields and AggregateSessionLockSchema
  const decoded = yield* Schema.decodeUnknownEffect(TicketRowSchema)(
    ticketRow,
  ).pipe(
    mapParseError({
      code: 'aggregate-session-websocket-ticket-row-invalid',
      prefix: 'Stored aggregate definition WebSocket ticket is invalid',
    }),
  );

  // 6 — compare expiresAt after consumption; expired tickets remain spent
  if (decoded.expiresAt.getTime() <= now.getTime()) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-websocket-ticket-invalid',
        message: 'Aggregate definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 7 — supply retained identity and lock fields to the forwarding path
  return decoded;
});
