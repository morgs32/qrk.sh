/*
 * System-worker annotation:
 * Mints one short-lived service-frontend WebSocket capability for an exact
 * actor-specific target. Only the SHA-256 hash is retained by SystemRepo.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  generationId: string;
  repoName: string;
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
    phase: AnyColumn;
  }>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
    generationId: AnyColumn;
  }>;
}) {
  const {
    db,
    serviceFrontendLock,
    serviceName,
    userId,
    frontendName,
    generationId,
    generationStateColumns,
    generationStateTable,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    repoName,
  } = props;

  // Checkpoint 1: the prefix is the only public routing hint. The random
  // suffix remains opaque and contains 256 bits encoded as unpadded base64url.
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

  const now = new Date();
  const encodedServiceFrontendLock = yield* Schema.encode(
    Schema.parseJson(ServiceFrontendLockSchema),
  )(serviceFrontendLock).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode service frontend lock',
      extra: { generationId },
    }),
  );

  // Checkpoint 2: hash first, then synchronously recheck read admission and
  // insert the exact actor-bound target. Source generations remain readable
  // while draining, but retirement fences every ticket path.
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

        tx.delete(serviceFrontendWebSocketTicketTable)
          .where(
            and(
              eq(
                serviceFrontendWebSocketTicketColumns.generationId,
                generationId,
              ),
              lte(serviceFrontendWebSocketTicketColumns.expiresAt, now),
            ),
          )
          .run();
        tx.insert(serviceFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            generationId,
            repoName,
            serviceName,
            userId,
            frontendName,
            serviceFrontendLock: encodedServiceFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();

        return null;
      }),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist service frontend WebSocket ticket',
      extra: {
        generationId,
        repoName,
      },
    }),
  });
  if (ZerospinError.isZerospinError(ticketWriteFailure)) {
    return yield* ticketWriteFailure;
  }

  return ticket;
});
