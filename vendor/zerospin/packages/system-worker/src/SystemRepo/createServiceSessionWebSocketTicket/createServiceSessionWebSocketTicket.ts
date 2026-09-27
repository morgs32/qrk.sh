/*
 * Mints a short-lived, single-use service definition WebSocket ticket.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import {
  ServiceSessionLockSchema,
  type IServiceSessionLock,
} from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { catchZerospinError, mapParseError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo mints a single-use ticket for a preselected service definition
 * log and lock. Only the ticket hash is retained; the raw random credential
 * is returned once for the subsequent WebSocket upgrade.
 *
 * 1. Generate an unguessable ticket.
 * 2. Hash the ticket for persistence.
 * 3. Serialize the admitted definition lock.
 * 4. Capture the ticket lifetime boundary.
 * 5. Commit ticket issuance and expiration cleanup.
 * 6. Return the raw ticket once.
 */
export const createServiceSessionWebSocketTicket = Effect.fn(
  'SystemRepo.createServiceSessionWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  serviceName: string;
  serviceVersion: string;
  actorPath: string;
  claims: Readonly<Record<string, unknown>>;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
  serviceSessionWebSocketTicketTable: IAnyDrizzleSchema;
  serviceSessionWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    db,
    sessionName,
    repoName,
    serviceSessionLock,
    serviceSessionWebSocketTicketColumns,
    serviceSessionWebSocketTicketTable,
    serviceName,
    actorPath,
    serviceVersion,
    claims,
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

  // 3 — encode ServiceSessionLockSchema for the retained ticket row
  const encodedServiceSessionLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(ServiceSessionLockSchema),
  )(serviceSessionLock).pipe(
    mapParseError({
      code: 'service-session-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode service definition lock',
    }),
  );

  // 4 — use a single timestamp for expiration pruning and the new 30-second lifetime
  const now = new Date();

  // 5 — delete expired rows and insert the hash, target, lock, and expiry atomically
  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        tx.delete(serviceSessionWebSocketTicketTable)
          .where(lte(serviceSessionWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(serviceSessionWebSocketTicketTable)
          .values({
            ticketHash,
            repoName,
            serviceName,
            serviceVersion,
            actorPath,
            claims: JSON.stringify(claims),
            sessionName,
            serviceSessionLock: encodedServiceSessionLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: catchZerospinError({
      code: 'service-session-websocket-ticket-write-failed',
      message: 'Failed to persist service definition WebSocket ticket',
      extra: { repoName },
    }),
  });

  // 6 — leave only its hash in durable storage
  return ticket;
});
