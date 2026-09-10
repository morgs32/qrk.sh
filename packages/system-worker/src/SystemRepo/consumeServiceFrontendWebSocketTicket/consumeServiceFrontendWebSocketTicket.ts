/*
 * Atomically validates and spends a service frontend WebSocket ticket.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo spends the service frontend ticket during WebSocket upgrade.
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
    serviceVersion: AnyColumn;
    userId: AnyColumn;
    frontendName: AnyColumn;
    serviceFrontendLock: AnyColumn;
  }>;
}) {
  const {
    db,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    ticket,
  } = props;

  // 1 — require exactly 43 base64url characters
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  // 2 — compute the same SHA-256 base64url hash used at issuance
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
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

  // 3 — DELETE RETURNING by ticketHash prevents a second successful consumer
  const TicketRowSchema = Schema.Struct({
    repoName: Schema.String,
    serviceName: Schema.String,
    serviceVersion: Schema.String,
    userId: Schema.String,
    frontendName: Schema.String,
    serviceFrontendLock: Schema.fromJsonString(ServiceFrontendLockSchema),
    expiresAt: Schema.Date,
  });
  const ticketRow = yield* Effect.try({
    try: () =>
      db
        .delete(serviceFrontendWebSocketTicketTable)
        .where(eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash))
        .returning({
          repoName: serviceFrontendWebSocketTicketColumns.repoName,
          serviceName: serviceFrontendWebSocketTicketColumns.serviceName,
          serviceVersion: serviceFrontendWebSocketTicketColumns.serviceVersion,
          userId: serviceFrontendWebSocketTicketColumns.userId,
          frontendName: serviceFrontendWebSocketTicketColumns.frontendName,
          serviceFrontendLock:
            serviceFrontendWebSocketTicketColumns.serviceFrontendLock,
          expiresAt: serviceFrontendWebSocketTicketColumns.expiresAt,
        } satisfies Record<keyof typeof TicketRowSchema.Encoded, AnyColumn>)
        .get(),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume service frontend WebSocket ticket',
    }),
  });

  // 4 — return the shared invalid-or-expired ticket failure
  if (ticketRow === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  // 5 — decode the stored fields and ServiceFrontendLockSchema
  const decoded = yield* Schema.decodeUnknownEffect(TicketRowSchema)(
    ticketRow,
  ).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored service frontend WebSocket ticket is invalid',
    }),
  );

  // 6 — compare expiresAt after consumption; expired tickets remain spent
  if (decoded.expiresAt.getTime() <= Date.now()) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  // 7 — supply retained identity and lock fields to the forwarding path
  return decoded;
});
