/*
 * Mints a short-lived, single-use service frontend WebSocket ticket.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo mints a single-use ticket for a preselected service frontend
 * log and lock. Only the ticket hash is retained; the raw random credential
 * is returned once for the subsequent WebSocket upgrade.
 *
 * 1. Generate an unguessable ticket.
 * 2. Hash the ticket for persistence.
 * 3. Serialize the admitted frontend lock.
 * 4. Capture the ticket lifetime boundary.
 * 5. Commit ticket issuance and expiration cleanup.
 * 6. Return the raw ticket once.
 */
export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  serviceName: string;
  serviceVersion: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    db,
    frontendName,
    repoName,
    serviceFrontendLock,
    serviceFrontendWebSocketTicketColumns,
    serviceFrontendWebSocketTicketTable,
    serviceName,
    userId,
  } = props;

  // 1 — encode 32 random bytes as unpadded base64url
  const ticketBytes = new Uint8Array(32);
  crypto.getRandomValues(ticketBytes);
  const ticket = btoa(String.fromCharCode(...ticketBytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // 2 — compute SHA-256 and encode the digest as base64url
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

  // 3 — encode ServiceFrontendLockSchema for the retained ticket row
  const encodedServiceFrontendLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(ServiceFrontendLockSchema),
  )(serviceFrontendLock).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode service frontend lock',
    }),
  );

  // 4 — use a single timestamp for expiration pruning and the new 30-second lifetime
  const now = new Date();

  // 5 — delete expired rows and insert the hash, target, lock, and expiry atomically
  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        tx.delete(serviceFrontendWebSocketTicketTable)
          .where(lte(serviceFrontendWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(serviceFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            repoName,
            serviceName,
            serviceVersion: props.serviceVersion,
            userId,
            frontendName,
            serviceFrontendLock: encodedServiceFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist service frontend WebSocket ticket',
      extra: { repoName },
    }),
  });

  // 6 — leave only its hash in durable storage
  return ticket;
});
