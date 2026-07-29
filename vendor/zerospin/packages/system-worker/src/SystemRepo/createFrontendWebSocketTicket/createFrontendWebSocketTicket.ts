/*
 * System-worker annotation:
 * Mints a short-lived, single-use frontend WebSocket admission capability.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, lte, type AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

export const createFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  repoName: string;
  frontendVersion: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    activeDeployId: AnyColumn;
    admission: AnyColumn;
    generationId: AnyColumn;
    readiness: AnyColumn;
  }>;
  frontendWebSocketTicketTable: IAnyDrizzleSchema;
  frontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    db,
    deployId,
    frontendWebSocketTicketColumns,
    frontendWebSocketTicketTable,
    frontendVersion,
    generationId,
    generationStateColumns,
    generationStateTable,
    repoName,
  } = props;

  // Checkpoint 1: the browser receives the generation routing key followed by
  // 256 random bits encoded as unpadded base64url. The generation prefix lets
  // the local SystemWorker select the owning SystemRepo before consuming the
  // capability; the complete value remains opaque and single-use to callers.
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
      code: 'frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash frontend WebSocket ticket',
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

  // Checkpoint 2: all asynchronous hash work is complete before the lifecycle
  // read. The read-admission check, expired-row cleanup, and hash insert are
  // one synchronous transaction. A frozen source therefore keeps minting
  // reconnect capabilities until completion closes reads and purges the rows.
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

        tx.delete(frontendWebSocketTicketTable)
          .where(lte(frontendWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(frontendWebSocketTicketTable)
          .values({
            ticketHash,
            deployId,
            repoName,
            frontendVersion,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();

        return null;
      }),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-write-failed',
      message: 'Failed to persist frontend WebSocket ticket',
      extra: { deployId, generationId, repoName, frontendVersion },
    }),
  });
  if (ZerospinError.isZerospinError(ticketWriteFailure)) {
    return yield* ticketWriteFailure;
  }

  return ticket;
});
