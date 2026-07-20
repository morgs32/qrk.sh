/*
 * System-worker annotation:
 * Mints a short-lived, single-use frontend WebSocket admission capability.
 * Only the SHA-256 hash is persisted; the raw ticket is returned once.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { lte, type AnyColumn } from 'drizzle-orm';
import { Effect } from 'effect';

import { assertGenerationAdmission } from '../assertGenerationAdmission/assertGenerationAdmission.js';

export const createFrontendWebSocketTicket = Effect.fn(
  'SystemRepo.createFrontendWebSocketTicket',
)(function* (props: {
  db: IDb;
  deployId: string;
  generationId: string;
  repoName: string;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    generationId: AnyColumn;
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
    generationId,
    generationStateColumns,
    generationStateTable,
    repoName,
  } = props;

  // Checkpoint 1: minting is a new capability grant, so draining generations
  // reject it through write admission even though existing tickets may consume.
  yield* assertGenerationAdmission({
    db,
    deployId,
    generationId,
    generationStateTable,
    generationStateColumns,
    mode: 'write',
  });

  const now = new Date();

  // Checkpoint 2: opportunistically remove expired rows before allocating a
  // fresh ticket. No alarm is needed because mint and consume both clean up.
  yield* Effect.try({
    try: () =>
      db
        .delete(frontendWebSocketTicketTable)
        .where(lte(frontendWebSocketTicketColumns.expiresAt, now))
        .run(),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-expiry-cleanup-failed',
      message: 'Failed to remove expired frontend WebSocket tickets',
      extra: { deployId, generationId },
    }),
  });

  // Checkpoint 3: the browser receives the generation routing key followed by
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

  // Checkpoint 4: persist only the hash and its exact FrontendBlockRepo target.
  // A random collision fails this mint; it is not silently retried.
  yield* Effect.try({
    try: () =>
      db
        .insert(frontendWebSocketTicketTable)
        .values({
          ticketHash,
          deployId,
          repoName,
          expiresAt: new Date(now.getTime() + 30_000),
        })
        .run(),
    catch: ZerospinError.catch({
      code: 'frontend-websocket-ticket-write-failed',
      message: 'Failed to persist frontend WebSocket ticket',
      extra: { deployId, generationId, repoName },
    }),
  });

  return ticket;
});
