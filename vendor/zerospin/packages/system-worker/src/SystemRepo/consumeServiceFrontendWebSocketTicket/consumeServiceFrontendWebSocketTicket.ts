/*
 * System-worker annotation:
 * Validates and atomically spends a service-frontend WebSocket capability,
 * returning only the exact target that SystemRepo persisted during minting.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { assertGenerationAdmission } from '../assertGenerationAdmission/assertGenerationAdmission.js';

export const consumeServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    generationId: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    serviceName: AnyColumn;
    userId: AnyColumn;
    frontendName: AnyColumn;
    serviceFrontendLock: AnyColumn;
  }>;
}): Effect.fn.Return<
  Readonly<{
    generationId: string;
    repoName: string;
    serviceName: string;
    userId: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  }>,
  IAnyError
> {
  const {
    db,
    generationStateColumns,
    generationStateTable,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    ticket,
  } = props;

  // Checkpoint 1: malformed, unknown, expired, and already-spent tickets share
  // one public failure so storage state and target identity are not disclosed.
  const ticketParts = ticket.split('.');
  const generationId = ticketParts[0];
  if (
    ticketParts.length !== 2 ||
    generationId === undefined ||
    !generationId.startsWith('gen_') ||
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

  // Checkpoint 2: load the stored generation and exact actor-specific target from
  // the ticket hash. No raw credential enters logs or error metadata.
  const rawTicketRow = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(serviceFrontendWebSocketTicketTable)
        .where(
          and(
            eq(
              serviceFrontendWebSocketTicketColumns.generationId,
              generationId,
            ),
            eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash),
          ),
        )
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
      generationId: Schema.String,
      expiresAt: Schema.DateFromSelf,
      repoName: Schema.String,
      serviceName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      serviceFrontendLock: Schema.parseJson(ServiceFrontendLockSchema),
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
            and(
              eq(
                serviceFrontendWebSocketTicketColumns.generationId,
                generationId,
              ),
              eq(serviceFrontendWebSocketTicketColumns.ticketHash, ticketHash),
            ),
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

  // Checkpoint 3: an already-issued ticket remains readable after source
  // retirement; only expiry, consumption, or an unreadable route invalidates it.
  yield* assertGenerationAdmission({
    db,
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
              serviceFrontendWebSocketTicketColumns.generationId,
              generationId,
            ),
            eq(
              serviceFrontendWebSocketTicketColumns.expiresAt,
              ticketRow.expiresAt,
            ),
          ),
        )
        .returning({
          generationId: serviceFrontendWebSocketTicketColumns.generationId,
          repoName: serviceFrontendWebSocketTicketColumns.repoName,
          serviceName: serviceFrontendWebSocketTicketColumns.serviceName,
          userId: serviceFrontendWebSocketTicketColumns.userId,
          frontendName: serviceFrontendWebSocketTicketColumns.frontendName,
          serviceFrontendLock:
            serviceFrontendWebSocketTicketColumns.serviceFrontendLock,
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
      generationId: Schema.String,
      repoName: Schema.String,
      serviceName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      serviceFrontendLock: Schema.parseJson(ServiceFrontendLockSchema),
    }),
  )(deletedTicketRow).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-consume-result-invalid',
      prefix: 'Consumed service frontend WebSocket ticket target is invalid',
      extra: { generationId },
    }),
  );

  if (
    consumedTarget.generationId !== ticketRow.generationId ||
    consumedTarget.repoName !== ticketRow.repoName ||
    consumedTarget.serviceName !== ticketRow.serviceName ||
    consumedTarget.userId !== ticketRow.userId ||
    consumedTarget.frontendName !== ticketRow.frontendName ||
    !isEqual(consumedTarget.serviceFrontendLock, ticketRow.serviceFrontendLock)
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
