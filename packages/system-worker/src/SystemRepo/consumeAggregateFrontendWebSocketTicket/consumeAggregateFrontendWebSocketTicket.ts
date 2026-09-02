/*
 * Atomically validates and spends an aggregate frontend WebSocket ticket.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

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
    userId: AnyColumn;
    frontendName: AnyColumn;
    aggregateFrontendLock: AnyColumn;
  }>;
}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(props.ticket)) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(props.ticket)),
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
  const ticketRow = yield* Effect.try({
    try: () =>
      props.db
        .delete(props.aggregateFrontendWebSocketTicketTable)
        .where(
          eq(
            props.aggregateFrontendWebSocketTicketColumns.ticketHash,
            ticketHash,
          ),
        )
        .returning({
          repoName: props.aggregateFrontendWebSocketTicketColumns.repoName,
          aggregateId:
            props.aggregateFrontendWebSocketTicketColumns.aggregateId,
          aggregateName:
            props.aggregateFrontendWebSocketTicketColumns.aggregateName,
          userId: props.aggregateFrontendWebSocketTicketColumns.userId,
          frontendName:
            props.aggregateFrontendWebSocketTicketColumns.frontendName,
          aggregateFrontendLock:
            props.aggregateFrontendWebSocketTicketColumns.aggregateFrontendLock,
          expiresAt: props.aggregateFrontendWebSocketTicketColumns.expiresAt,
        })
        .get(),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume aggregate frontend WebSocket ticket',
    }),
  });
  if (ticketRow === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }
  const decoded = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      repoName: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      aggregateFrontendLock: Schema.fromJsonString(AggregateFrontendLockSchema),
      expiresAt: Schema.Date,
    }),
  )(ticketRow).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored aggregate frontend WebSocket ticket is invalid',
    }),
  );
  if (decoded.expiresAt.getTime() <= now.getTime()) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }
  return decoded;
});
