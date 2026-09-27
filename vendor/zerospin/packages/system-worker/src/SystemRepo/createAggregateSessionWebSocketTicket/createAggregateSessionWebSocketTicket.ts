/*
 * Mints a short-lived, single-use aggregate definition WebSocket ticket.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import {
  AggregateSessionLockSchema,
  type IAggregateSessionLock,
} from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { catchZerospinError, mapParseError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo mints a single-use ticket for a preselected aggregate definition
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
export const createAggregateSessionWebSocketTicket = Effect.fn(
  'SystemRepo.createAggregateSessionWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  aggregateId: string;
  aggregateName: string;
  aggregateVersion: string;
  actorPath: string;
  actorName: string;
  actorVersion: string;
  identity: Readonly<Record<string, unknown>>;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
  aggregateSessionWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateSessionWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    aggregateSessionLock,
    aggregateSessionWebSocketTicketColumns,
    aggregateSessionWebSocketTicketTable,
    aggregateId,
    aggregateName,
    db,
    sessionName,
    repoName,
    actorPath,
    aggregateVersion,
    actorName,
    actorVersion,
    identity,
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
      code: 'aggregate-session-websocket-ticket-hash-failed',
      message: 'Failed to hash aggregate definition WebSocket ticket',
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // 3 — encode AggregateSessionLockSchema for the retained ticket row
  const encodedAggregateSessionLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(AggregateSessionLockSchema),
  )(aggregateSessionLock).pipe(
    mapParseError({
      code: 'aggregate-session-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode aggregate definition lock',
    }),
  );

  // 4 — use a single timestamp for expiration pruning and the new 30-second lifetime
  const now = new Date();

  // 5 — delete expired rows and insert the hash, target, lock, and expiry atomically
  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        tx.delete(aggregateSessionWebSocketTicketTable)
          .where(lte(aggregateSessionWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(aggregateSessionWebSocketTicketTable)
          .values({
            ticketHash,
            repoName,
            aggregateId,
            aggregateName,
            aggregateVersion,
            actorName,
            actorVersion,
            actorPath,
            identity: JSON.stringify(identity),
            sessionName,
            aggregateSessionLock: encodedAggregateSessionLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: catchZerospinError({
      code: 'aggregate-session-websocket-ticket-write-failed',
      message: 'Failed to persist aggregate definition WebSocket ticket',
      extra: { repoName },
    }),
  });

  // 6 — leave only its hash in durable storage
  return ticket;
});
