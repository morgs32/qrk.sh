/*
 * Atomically validates and spends a service definition WebSocket ticket.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import {
  catchZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo spends the service definition ticket during WebSocket upgrade.
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
export const consumeServiceSessionWebSocketTicket = Effect.fn(
  'SystemRepo.consumeServiceSessionWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  serviceSessionWebSocketTicketTable: IAnyDrizzleSchema;
  serviceSessionWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    serviceName: AnyColumn;
    serviceVersion: AnyColumn;
    actorPath: AnyColumn;
    identity: AnyColumn;
    sessionName: AnyColumn;
    serviceSessionLock: AnyColumn;
  }>;
}) {
  const {
    db,
    serviceSessionWebSocketTicketColumns,
    serviceSessionWebSocketTicketTable,
    ticket,
  } = props;

  // 1 — require exactly 43 base64url characters
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-websocket-ticket-invalid',
        message: 'Service definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 2 — compute the same SHA-256 base64url hash used at issuance
  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: catchZerospinError({
      code: 'service-session-websocket-ticket-hash-failed',
      message: 'Failed to hash service definition WebSocket ticket',
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
    actorPath: Schema.String,
    identity: Schema.fromJsonString(
      Schema.Record(Schema.String, Schema.Unknown),
    ),
    sessionName: Schema.String,
    serviceSessionLock: Schema.fromJsonString(ServiceSessionLockSchema),
    expiresAt: Schema.Date,
  });
  const ticketRow = yield* Effect.try({
    try: () =>
      db
        .delete(serviceSessionWebSocketTicketTable)
        .where(eq(serviceSessionWebSocketTicketColumns.ticketHash, ticketHash))
        .returning({
          repoName: serviceSessionWebSocketTicketColumns.repoName,
          serviceName: serviceSessionWebSocketTicketColumns.serviceName,
          serviceVersion: serviceSessionWebSocketTicketColumns.serviceVersion,
          actorPath: serviceSessionWebSocketTicketColumns.actorPath,
          identity: serviceSessionWebSocketTicketColumns.identity,
          sessionName: serviceSessionWebSocketTicketColumns.sessionName,
          serviceSessionLock:
            serviceSessionWebSocketTicketColumns.serviceSessionLock,
          expiresAt: serviceSessionWebSocketTicketColumns.expiresAt,
        } satisfies Record<keyof typeof TicketRowSchema.Encoded, AnyColumn>)
        .get(),
    catch: catchZerospinError({
      code: 'service-session-websocket-ticket-consume-failed',
      message: 'Failed to consume service definition WebSocket ticket',
    }),
  });

  // 4 — return the shared invalid-or-expired ticket failure
  if (ticketRow === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-websocket-ticket-invalid',
        message: 'Service definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 5 — decode the stored fields and ServiceSessionLockSchema
  const decoded = yield* Schema.decodeUnknownEffect(TicketRowSchema)(
    ticketRow,
  ).pipe(
    mapParseError({
      code: 'service-session-websocket-ticket-row-invalid',
      prefix: 'Stored service definition WebSocket ticket is invalid',
    }),
  );

  // 6 — compare expiresAt after consumption; expired tickets remain spent
  if (decoded.expiresAt.getTime() <= Date.now()) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-websocket-ticket-invalid',
        message: 'Service definition WebSocket ticket is invalid or expired',
      }),
    );
  }

  // 7 — supply retained identity and lock fields to the forwarding path
  return decoded;
});
