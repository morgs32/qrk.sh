/*
 * System-worker annotation:
 * Validates, admits, and atomically spends a frontend WebSocket ticket before
 * the caller forwards the upgrade to its stored FrontendBlockRepo name.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { assertGenerationAdmission } from '../assertGenerationAdmission/assertGenerationAdmission.js';

export const consumeFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  generationId: string;
  ticket: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  frontendWebSocketTicketTable: IAnyDrizzleSchema;
  frontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    deployId: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
  }>;
}) {
  const {
    db,
    frontendWebSocketTicketColumns,
    frontendWebSocketTicketTable,
    generationId,
    generationStateColumns,
    generationStateTable,
    ticket,
  } = props;

  // Checkpoint 1: reject malformed tickets without hashing or touching storage.
  // The error is deliberately identical to missing, expired, and reused cases.
  const ticketParts = ticket.split('.');
  if (
    ticketParts.length !== 2 ||
    ticketParts[0] !== generationId ||
    ticketParts[1] === undefined ||
    !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1])
  ) {
    return yield* new ZerospinError({
      code: 'frontend-websocket-ticket-invalid',
      message: 'Frontend WebSocket ticket is invalid or expired',
    });
  }

  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // Checkpoint 2: resolve the stored deploy and repo target from the hash. The
  // raw ticket is never persisted or included in errors.
  const rawTicketRow = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(frontendWebSocketTicketTable)
        .where(eq(frontendWebSocketTicketColumns.ticketHash, ticketHash))
        .get(),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-read-failed',
      message: 'Failed to read frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (rawTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-websocket-ticket-invalid',
      message: 'Frontend WebSocket ticket is invalid or expired',
    });
  }
  const ticketRow = yield* Schema.decodeUnknown(
    Schema.Struct({
      deployId: Schema.String,
      repoName: Schema.String,
      expiresAt: Schema.DateFromSelf,
    }),
  )(rawTicketRow).pipe(
    mapParseError({
      code: 'frontend-websocket-ticket-row-invalid',
      prefix: 'Stored frontend WebSocket ticket is invalid',
      extra: { generationId },
    }),
  );

  const now = new Date();
  if (ticketRow.expiresAt.getTime() <= now.getTime()) {
    yield* Effect.try({
      try: () =>
        db
          .delete(frontendWebSocketTicketTable)
          .where(eq(frontendWebSocketTicketColumns.ticketHash, ticketHash))
          .run(),
      catch: ZerospinError.catch({
        code: 'frontend-websocket-ticket-expired-delete-failed',
        message: 'Failed to remove expired frontend WebSocket ticket',
        extra: { generationId },
      }),
    });
    return yield* new ZerospinError({
      code: 'frontend-websocket-ticket-invalid',
      message: 'Frontend WebSocket ticket is invalid or expired',
    });
  }

  // Checkpoint 3: consuming an already minted capability is read admission.
  // It remains valid while draining, but not after the generation is drained.
  yield* assertGenerationAdmission({
    db,
    deployId: ticketRow.deployId,
    generationId,
    generationStateTable,
    generationStateColumns,
    mode: 'read',
  });

  // Checkpoint 4: the conditional delete is the atomic single-use boundary.
  // No await occurs between reading this row and spending it in the same DO.
  const deletedTicketRow = yield* Effect.try({
    try: () =>
      db
        .delete(frontendWebSocketTicketTable)
        .where(
          and(
            eq(frontendWebSocketTicketColumns.ticketHash, ticketHash),
            eq(frontendWebSocketTicketColumns.deployId, ticketRow.deployId),
            eq(frontendWebSocketTicketColumns.expiresAt, ticketRow.expiresAt),
          ),
        )
        .returning({ repoName: frontendWebSocketTicketColumns.repoName })
        .get(),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (deletedTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-websocket-ticket-invalid',
      message: 'Frontend WebSocket ticket is invalid or expired',
    });
  }
  const decodedDeletedTicketRow = yield* Schema.decodeUnknown(
    Schema.Struct({ repoName: Schema.String }),
  )(deletedTicketRow).pipe(
    mapParseError({
      code: 'frontend-websocket-ticket-consume-result-invalid',
      prefix: 'Frontend WebSocket ticket delete result is invalid',
      extra: { generationId },
    }),
  );
  if (decodedDeletedTicketRow.repoName !== ticketRow.repoName) {
    return yield* new ZerospinError({
      code: 'frontend-websocket-ticket-consume-target-mismatch',
      message: 'Consumed frontend WebSocket ticket target does not match',
      extra: { generationId },
    });
  }

  return decodedDeletedTicketRow.repoName;
});
