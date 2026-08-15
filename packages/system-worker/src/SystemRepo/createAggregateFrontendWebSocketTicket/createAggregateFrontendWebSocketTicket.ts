/*
 * System-worker annotation:
 * Mints a short-lived, single-use frontend WebSocket admission capability.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createAggregateFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  generationId: string;
  repoName: string;
  aggregateId: string;
  aggregateName: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
    phase: AnyColumn;
  }>;
  aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
    generationId: AnyColumn;
  }>;
}) {
  const {
    db,
    aggregateFrontendWebSocketTicketColumns,
    aggregateFrontendWebSocketTicketTable,
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    userId,
    frontendName,
    generationId,
    generationStateColumns,
    generationStateTable,
    repoName,
  } = props;

  // Checkpoint 1: the browser receives the generation routing key followed by
  // 256 random bits encoded as unpadded base64url. The singleton SystemRepo
  // uses the prefix to select the generation-specific read route while the
  // complete value remains opaque and single-use to callers.
  const ticketBytes = new Uint8Array(32);
  crypto.getRandomValues(ticketBytes);
  const randomTicket = btoa(String.fromCharCode(...ticketBytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const ticket = `${generationId}.${randomTicket}`;

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

  const now = new Date();
  const encodedAggregateFrontendLock = yield* Schema.encode(
    Schema.parseJson(AggregateFrontendLockSchema),
  )(aggregateFrontendLock).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode aggregate frontend lock',
      extra: { generationId },
    }),
  );

  // Checkpoint 2: all asynchronous hash work is complete before the lifecycle
  // read. The read-admission check, expired-row cleanup, and hash insert are
  // one synchronous transaction. Source generations remain readable while
  // draining, but retirement fences every new or previously minted ticket.
  const ticketWriteFailure = yield* Effect.try({
    try: (): IAnyError | null =>
      db.transaction(tx => {
        const generationState = tx
          .select({
            generationId: generationStateColumns.generationId,
            phase: generationStateColumns.phase,
          })
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get();

        if (generationState === undefined) {
          return new ZerospinError({
            code: 'generation-not-prepared',
            message: 'The requested generation has not been prepared',
            extra: { generationId, mode: 'read' },
          });
        }
        if (generationState.generationId !== generationId) {
          return new ZerospinError({
            code: 'generation-admission-identity-mismatch',
            message:
              'Stored generation state does not match the requested generation',
            extra: {
              generationId,
              storedGenerationId: generationState.generationId,
              mode: 'read',
            },
          });
        }
        if (
          generationState.phase !== 'open' &&
          generationState.phase !== 'draining'
        ) {
          return new ZerospinError({
            code: 'generation-read-admission-closed',
            message: 'Read admission is closed for this generation',
            extra: {
              generationId,
              phase: generationState.phase,
            },
          });
        }

        tx.delete(aggregateFrontendWebSocketTicketTable)
          .where(
            and(
              eq(
                aggregateFrontendWebSocketTicketColumns.generationId,
                generationId,
              ),
              lte(aggregateFrontendWebSocketTicketColumns.expiresAt, now),
            ),
          )
          .run();
        tx.insert(aggregateFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            generationId,
            repoName,
            aggregateId,
            aggregateName,
            userId,
            frontendName,
            aggregateFrontendLock: encodedAggregateFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();

        return null;
      }),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist aggregate frontend WebSocket ticket',
      extra: { generationId, repoName },
    }),
  });
  if (ZerospinError.isZerospinError(ticketWriteFailure)) {
    return yield* ticketWriteFailure;
  }

  return ticket;
});
