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

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createServiceFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  repoName: string;
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
  serviceFrontendWebSocketTicketColumns: Readonly<{
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
  const serviceFrontendLock = yield* Schema.encodeEffect(
    Schema.fromJsonString(ServiceFrontendLockSchema),
  )(props.serviceFrontendLock).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-lock-encode-failed',
      prefix: 'Failed to encode service frontend lock',
    }),
  );
  const now = new Date();

  yield* Effect.try({
    try: () =>
      props.db.transaction(tx => {
        tx.delete(props.serviceFrontendWebSocketTicketTable)
          .where(
            lte(props.serviceFrontendWebSocketTicketColumns.expiresAt, now),
          )
          .run();
        tx.insert(props.serviceFrontendWebSocketTicketTable)
          .values({
            ticketHash,
            repoName: props.repoName,
            serviceName: props.serviceName,
            userId: props.userId,
            frontendName: props.frontendName,
            serviceFrontendLock,
            expiresAt: new Date(now.getTime() + 30_000),
          })
          .run();
      }),
    catch: ZerospinError.catch({
      code: 'service-frontend-websocket-ticket-write-failed',
      message: 'Failed to persist service frontend WebSocket ticket',
      extra: { repoName: props.repoName },
    }),
  });

  return ticket;
});
