/*
 * Mints a short-lived, single-use aggregate frontend WebSocket ticket.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { mapParseError, ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { lte, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

/*
 * SystemRepo mints a single-use ticket for a preselected aggregate frontend
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
export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createAggregateFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  aggregateId: string;
  aggregateName: string;
  aggregateVersion: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const {
    aggregateFrontendLock,
    aggregateFrontendWebSocketTicketColumns,
    aggregateFrontendWebSocketTicketTable,
    aggregateId,
    aggregateName,
    db,
    frontendName,
    repoName,
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
      code: 'aggregate-frontend-websocket-ticket-hash-failed',
      message: 'Failed to hash aggregate frontend WebSocket ticket',
    }),
  });
  const ticketHash = btoa(
    String.fromCharCode(...new Uint8Array(ticketHashBuffer)),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  // 3 — encode AggregateFrontendLockSchema for the retained ticket row
  const encodedAggregateFrontendLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(AggregateFrontendLockSchema),
  )(aggregateFrontendLock).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode aggregate frontend lock',
    }),
  );

  // 4 — use a single timestamp for expiration pruning and the new 30-second lifetime
  const now = new Date();

  // 5 — delete expired rows and insert the hash, target, lock, and expiry atomically
  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        tx.delete(aggregateFrontendWebSocketTicketTable)
          .where(lte(aggregateFrontendWebSocketTicketColumns.expiresAt, now))
          .run();
        tx.insert(aggregateFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            repoName,
            aggregateId,
            aggregateName,
            aggregateVersion: props.aggregateVersion,
            userId,
            frontendName,
            aggregateFrontendLock: encodedAggregateFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist aggregate frontend WebSocket ticket',
      extra: { repoName },
    }),
  });

  // 6 — leave only its hash in durable storage
  return ticket;
});
