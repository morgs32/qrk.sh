/*
 * System-worker annotation:
 * Validates, admits, and atomically spends a frontend WebSocket ticket before
 * the caller forwards the upgrade to its stored AggregateFrontendBlockRepo name.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

import { assertGenerationAdmission } from '../assertGenerationAdmission/assertGenerationAdmission.js';

export const consumeAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.consumeAggregateFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
  }>;
  aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateFrontendWebSocketTicketColumns: Readonly<{
    ticketHash: AnyColumn;
    generationId: AnyColumn;
    expiresAt: AnyColumn;
    repoName: AnyColumn;
    aggregateId: AnyColumn;
    aggregateName: AnyColumn;
    userId: AnyColumn;
    frontendName: AnyColumn;
    aggregateFrontendLock: AnyColumn;
  }>;
}) {
  const {
    db,
    aggregateFrontendWebSocketTicketColumns,
    aggregateFrontendWebSocketTicketTable,
    generationStateColumns,
    generationStateTable,
    ticket,
  } = props;

  // Checkpoint 1: reject malformed tickets without hashing or touching storage.
  // The error is deliberately identical to missing, expired, and reused cases.
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
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }

  const ticketHashBuffer = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(ticket)),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash aggregate frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // Checkpoint 2: resolve the stored generation and Repo target from the hash. The
  // raw ticket is never persisted or included in errors.
  const rawTicketRow = yield* Effect.try({
    try: () =>
      db
        .select()
        .from(aggregateFrontendWebSocketTicketTable)
        .where(
          and(
            eq(
              aggregateFrontendWebSocketTicketColumns.generationId,
              generationId,
            ),
            eq(aggregateFrontendWebSocketTicketColumns.ticketHash, ticketHash),
          ),
        )
        .get(),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-read-failed',
      message: 'Failed to read aggregate frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (rawTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }
  const ticketRow = yield* Schema.decodeUnknown(
    Schema.Struct({
      generationId: Schema.String,
      repoName: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      aggregateFrontendLock: Schema.parseJson(AggregateFrontendLockSchema),
      expiresAt: Schema.DateFromSelf,
    }),
  )(rawTicketRow).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-row-invalid',
      prefix: 'Stored aggregate frontend WebSocket ticket is invalid',
      extra: { generationId },
    }),
  );

  const now = new Date();
  if (ticketRow.expiresAt.getTime() <= now.getTime()) {
    yield* Effect.try({
      try: () =>
        db
          .delete(aggregateFrontendWebSocketTicketTable)
          .where(
            and(
              eq(
                aggregateFrontendWebSocketTicketColumns.generationId,
                generationId,
              ),
              eq(
                aggregateFrontendWebSocketTicketColumns.ticketHash,
                ticketHash,
              ),
            ),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'aggregate-frontend-websocket-ticket-expired-delete-failed',
        message: 'Failed to remove expired aggregate frontend WebSocket ticket',
        extra: { generationId },
      }),
    });
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }

  // Checkpoint 3: consuming an already minted capability is read admission.
  // Deploy promotion and completed retirement do not revoke the read route.
  yield* assertGenerationAdmission({
    db,
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
        .delete(aggregateFrontendWebSocketTicketTable)
        .where(
          and(
            eq(aggregateFrontendWebSocketTicketColumns.ticketHash, ticketHash),
            eq(
              aggregateFrontendWebSocketTicketColumns.generationId,
              generationId,
            ),
            eq(
              aggregateFrontendWebSocketTicketColumns.expiresAt,
              ticketRow.expiresAt,
            ),
          ),
        )
        .returning({
          generationId: aggregateFrontendWebSocketTicketColumns.generationId,
          repoName: aggregateFrontendWebSocketTicketColumns.repoName,
          aggregateId: aggregateFrontendWebSocketTicketColumns.aggregateId,
          aggregateName: aggregateFrontendWebSocketTicketColumns.aggregateName,
          userId: aggregateFrontendWebSocketTicketColumns.userId,
          frontendName: aggregateFrontendWebSocketTicketColumns.frontendName,
          aggregateFrontendLock:
            aggregateFrontendWebSocketTicketColumns.aggregateFrontendLock,
        })
        .get(),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-consume-failed',
      message: 'Failed to consume aggregate frontend WebSocket ticket',
      extra: { generationId },
    }),
  });
  if (deletedTicketRow === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-invalid',
      message: 'Aggregate frontend WebSocket ticket is invalid or expired',
    });
  }
  const decodedDeletedTicketRow = yield* Schema.decodeUnknown(
    Schema.Struct({
      generationId: Schema.String,
      repoName: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      userId: Schema.String,
      frontendName: Schema.String,
      aggregateFrontendLock: Schema.parseJson(AggregateFrontendLockSchema),
    }),
  )(deletedTicketRow).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-consume-result-invalid',
      prefix: 'Aggregate frontend WebSocket ticket delete result is invalid',
      extra: { generationId },
    }),
  );
  if (
    decodedDeletedTicketRow.generationId !== ticketRow.generationId ||
    decodedDeletedTicketRow.repoName !== ticketRow.repoName ||
    decodedDeletedTicketRow.aggregateId !== ticketRow.aggregateId ||
    decodedDeletedTicketRow.aggregateName !== ticketRow.aggregateName ||
    decodedDeletedTicketRow.userId !== ticketRow.userId ||
    decodedDeletedTicketRow.frontendName !== ticketRow.frontendName ||
    !isEqual(
      decodedDeletedTicketRow.aggregateFrontendLock,
      ticketRow.aggregateFrontendLock,
    )
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-websocket-ticket-consume-target-mismatch',
      message:
        'Consumed aggregate frontend WebSocket ticket target does not match',
      extra: { generationId },
    });
  }

  return decodedDeletedTicketRow;
});
