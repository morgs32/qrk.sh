/*
 * Atomically validates and spends a service frontend WebSocket ticket.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const consumeServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    serviceName: AnyColumn;
    userId: AnyColumn;
    frontendName: AnyColumn;
    serviceFrontendLock: AnyColumn;
  }>;
}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(props.ticket)) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(props.ticket)),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash service frontend WebSocket ticket',
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const ticketRow = yield* Effect.try({
    try: () =>
      props.db
        .delete(props.serviceFrontendWebSocketTicketTable)
        .where(
          eq(
            props.serviceFrontendWebSocketTicketColumns.ticketHash,
            ticketHash,
          ),
        )
        .returning({
          repoName: props.serviceFrontendWebSocketTicketColumns.repoName,
          serviceName: props.serviceFrontendWebSocketTicketColumns.serviceName,
          userId: props.serviceFrontendWebSocketTicketColumns.userId,
          frontendName:
            props.serviceFrontendWebSocketTicketColumns.frontendName,
          serviceFrontendLock:
            props.serviceFrontendWebSocketTicketColumns.serviceFrontendLock,
          expiresAt: props.serviceFrontendWebSocketTicketColumns.expiresAt,
        })
        .get(),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume service frontend WebSocket ticket',
    }),
  });
  if (ticketRow === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }
  const decoded = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      repoName: Schema.String,
      serviceName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      serviceFrontendLock: Schema.fromJsonString(ServiceFrontendLockSchema),
      expiresAt: Schema.Date,
    }),
  )(ticketRow).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored service frontend WebSocket ticket is invalid',
    }),
  );
  if (decoded.expiresAt.getTime() <= Date.now()) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }
  return decoded;
});
