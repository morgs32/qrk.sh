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

export const createAggregateFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createAggregateFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  aggregateId: string;
  aggregateName: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  aggregateFrontendWebSocketTicketColumns: Readonly<{
    expiresAt: AnyColumn;
  }>;
}) {
  const ticketBytes = new Uint8Array(32);
  crypto.getRandomValues(ticketBytes);
  const ticket = btoa(String.fromCharCode(...ticketBytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
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
  const aggregateFrontendLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(AggregateFrontendLockSchema),
  )(props.aggregateFrontendLock).pipe(
    mapParseError({
      code: 'aggregate-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode aggregate frontend lock',
    }),
  );
  const now = new Date();

  yield* Effect.try({
    try: () =>
      props.db.transaction(tx => {
        tx.delete(props.aggregateFrontendWebSocketTicketTable)
          .where(
            lte(props.aggregateFrontendWebSocketTicketColumns.expiresAt, now),
          )
          .run();
        tx.insert(props.aggregateFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            repoName: props.repoName,
            aggregateId: props.aggregateId,
            aggregateName: props.aggregateName,
            userId: props.userId,
            frontendName: props.frontendName,
            aggregateFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: ZerospinError.catch({
      code: 'aggregate-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist aggregate frontend WebSocket ticket',
      extra: { repoName: props.repoName },
    }),
  });

  return ticket;
});
