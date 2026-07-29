/*
 * System-worker annotation:
 * Mints one short-lived service-frontend WebSocket capability for an exact
 * actor-specific target. Only the SHA-256 hash is retained by SystemRepo.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IActorId, IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, lte, type AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  serviceName: string;
  actorName: string;
  actorId: IActorId;
  frontendName: string;
  frontendVersion: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    activeDeployId: AnyColumn;
    admission: AnyColumn;
    generationId: AnyColumn;
    readiness: AnyColumn;
  }>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    actorId,
    actorName,
    db,
    deployId,
    frontendName,
    frontendVersion,
    generationId,
    generationStateColumns,
    generationStateTable,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    serviceName,
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
      extra: { deployId, generationId },
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  const now = new Date();

  // Checkpoint 2: hash first, then synchronously recheck read admission and
  // insert the exact actor-bound target. A draining source remains readable,
  // so reconnect tickets continue until completion closes reads and purges
  // ticket rows. Lifecycle state and tickets share this SystemRepo owner.
  const ticketWriteFailure = yield* Effect.try({
    try: (): IAnyError | null =>
      db.transaction(tx => {
        const generationState = tx
          .select({
            generationId: generationStateColumns.generationId,
            activeDeployId: generationStateColumns.activeDeployId,
            readiness: generationStateColumns.readiness,
            admission: generationStateColumns.admission,
          })
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get();

        if (generationState === undefined) {
          return new ZerospinError({
            code: 'generation-not-prepared',
            message: 'The requested generation has not been prepared',
            extra: { deployId, generationId, mode: 'read' },
          });
        }
        if (generationState.generationId !== generationId) {
          return new ZerospinError({
            code: 'generation-admission-identity-mismatch',
            message: 'Stored generation state does not match this SystemRepo',
            extra: {
              deployId,
              generationId,
              storedGenerationId: generationState.generationId,
              mode: 'read',
            },
          });
        }
        if (generationState.readiness !== 'ready') {
          return new ZerospinError({
            code: 'generation-not-ready',
            message: 'The requested generation is not ready',
            extra: {
              deployId,
              generationId,
              readiness: generationState.readiness,
              mode: 'read',
            },
          });
        }
        if (generationState.activeDeployId !== deployId) {
          return new ZerospinError({
            code: 'generation-deploy-not-active',
            message: 'The capability deploy is not active for this generation',
            extra: {
              deployId,
              generationId,
              activeDeployId: generationState.activeDeployId,
              mode: 'read',
            },
          });
        }
        if (
          generationState.admission !== 'open' &&
          generationState.admission !== 'draining'
        ) {
          return new ZerospinError({
            code: 'generation-read-admission-closed',
            message: 'Read admission is closed for this generation',
            extra: {
              deployId,
              generationId,
              admission: generationState.admission,
            },
          });
        }

        tx.delete(serviceFrontendWebSocketTicketTable)
          .where(lte(serviceFrontendWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(serviceFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            deployId,
            serviceName,
            actorName,
            actorId,
            frontendName,
            frontendVersion,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();

        return null;
      }),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist service frontend WebSocket ticket',
      extra: {
        deployId,
        generationId,
        serviceName,
        actorName,
        actorId,
        frontendName,
        frontendVersion,
      },
    }),
  });
  if (ZerospinError.isZerospinError(ticketWriteFailure)) {
    return yield* ticketWriteFailure;
  }

  return ticket;
});
