/*
 * System-worker annotation:
 * Validates and atomically spends a service-frontend WebSocket capability,
 * returning only the exact target that SystemRepo persisted during minting.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IActorId, IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { assertGenerationAdmission } from '../assertGenerationAdmission/assertGenerationAdmission.js';

export const consumeServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  generationId: string;
  ticket: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    deployId: AnyColumn;
    expiresAt: AnyColumn;
    serviceName: AnyColumn;
    actorName: AnyColumn;
    actorId: AnyColumn;
    frontendName: AnyColumn;
    frontendVersion: AnyColumn;
  }>;
}): Effect.fn.Return<
  Readonly<{
    serviceName: string;
    actorName: string;
    actorId: IActorId;
    frontendName: string;
    frontendVersion: string;
  }>,
  IAnyError
> {
  const {
    db,
    generationId,
    generationStateColumns,
    generationStateTable,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    ticket,
  } = props;

  // Checkpoint 1: malformed, unknown, expired, and already-spent tickets share
  // one public failure so storage state and target identity are not disclosed.
  const ticketParts = ticket.split('.');
  if (
    ticketParts.length !== 2 ||
    ticketParts[0] !== generationId ||
    ticketParts[1] === undefined ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1])
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash service frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // Checkpoint 2: load the stored deploy and exact actor-specific target from
  // the ticket hash. No raw credential enters logs or error metadata.
  const rawTicketRow = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(serviceFrontendWebSocketTicketTable)
        .where(eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash))
        .get(),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-read-failed',
      message: 'Failed to read service frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (rawTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  const ticketRow = yield* Schema.decodeUnknown(
    Schema.Struct({
      deployId: Schema.String,
      expiresAt: Schema.DateFromSelf,
      serviceName: Schema.String,
      actorName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      frontendName: Schema.String,
      frontendVersion: Schema.String,
    }),
  )(rawTicketRow).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored service frontend WebSocket ticket is invalid',
      extra: { generationId },
    }),
  );

  const now = new Date();
  if (ticketRow.expiresAt.getTime() <= now.getTime()) {
    yield* Effect.try({
      try: () =>
        db
          .delete(serviceFrontendWebSocketTicketTable)
          .where(
            eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'service-frontend-websocket-ticket-expired-delete-failed',
        message: 'Failed to remove expired service frontend WebSocket ticket',
        extra: { generationId },
      }),
    });
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  // Checkpoint 3: an already-issued ticket remains readable while the source
  // generation is frozen, but never after completion marks it drained.
  yield* assertGenerationAdmission({
    db,
    deployId: ticketRow.deployId,
    generationId,
    generationStateTable,
    generationStateColumns,
    mode: 'read',
  });

  // Checkpoint 4: the conditional delete is the no-await, single-use boundary
  // inside this SystemRepo Durable Object.
  const deletedTicketRow = yield* Effect.try({
    try: () =>
      db
        .delete(serviceFrontendWebSocketTicketTable)
        .where(
          and(
            eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash),
            eq(
              serviceFrontendWebSocketTicketColumns.deployId,
              ticketRow.deployId,
            ),
            eq(
              serviceFrontendWebSocketTicketColumns.expiresAt,
              ticketRow.expiresAt,
            ),
          ),
        )
        .returning({
          serviceName: serviceFrontendWebSocketTicketColumns.serviceName,
          actorName: serviceFrontendWebSocketTicketColumns.actorName,
          actorId: serviceFrontendWebSocketTicketColumns.actorId,
          frontendName: serviceFrontendWebSocketTicketColumns.frontendName,
          frontendVersion:
            serviceFrontendWebSocketTicketColumns.frontendVersion,
        })
        .get(),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume service frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (deletedTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-invalid',
      message: 'Service frontend WebSocket ticket is invalid or expired',
    });
  }

  const consumedTarget = yield* Schema.decodeUnknown(
    Schema.Struct({
      serviceName: Schema.String,
      actorName: Schema.String,
      actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
      frontendName: Schema.String,
      frontendVersion: Schema.String,
    }),
  )(deletedTicketRow).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-consume-result-invalid',
      prefix: 'Consumed service frontend WebSocket ticket target is invalid',
      extra: { generationId },
    }),
  );

  if (
    consumedTarget.serviceName !== ticketRow.serviceName ||
    consumedTarget.actorName !== ticketRow.actorName ||
    consumedTarget.actorId !== ticketRow.actorId ||
    consumedTarget.frontendName !== ticketRow.frontendName ||
    consumedTarget.frontendVersion !== ticketRow.frontendVersion
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-websocket-ticket-consume-target-mismatch',
      message:
        'Consumed service frontend WebSocket ticket target does not match',
      extra: { generationId },
    });
  }

  return consumedTarget;
});
