import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { getTableColumns } from 'drizzle-orm';
import { Effect, Result } from 'effect';
import { describe, expect } from 'vitest';

import { createAggregateFrontendWebSocketTicket } from '../createAggregateFrontendWebSocketTicket/createAggregateFrontendWebSocketTicket.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { consumeAggregateFrontendWebSocketTicket } from './consumeAggregateFrontendWebSocketTicket.js';

describe('SystemRepo.consumeAggregateFrontendWebSocketTicket', () => {
  it.effect(
    'returns the persisted aggregate version and lock exactly once',
    () =>
      Effect.gen(function* () {
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: systemRepoDbConfig,
        });
        const table =
          systemRepoDbConfig.schema.aggregateFrontendWebSocketTickets;
        const ticketStorage = {
          db,
          aggregateFrontendWebSocketTicketTable: table,
          aggregateFrontendWebSocketTicketColumns: getTableColumns(table),
        };
        const target = {
          repoName: 'aggregate-ticket-round-trip',
          aggregateId: 'agg_ticket_round_trip',
          aggregateName: 'shopper',
          aggregateVersion: '2.0.0',
          userId: 'usr_ticket_round_trip',
          frontendName: 'main',
          aggregateFrontendLock: {
            systemName: 'shopping',
            frontendName: 'main',
            models: {},
            contracts: {},
          },
        };
        const ticket = yield* createAggregateFrontendWebSocketTicket({
          ...ticketStorage,
          ...target,
        });

        const consumed = yield* consumeAggregateFrontendWebSocketTicket({
          ...ticketStorage,
          ticket,
        });
        expect(consumed).toEqual({ ...target, expiresAt: expect.any(Date) });
        expect(db.select().from(table).all()).toEqual([]);

        const reused = yield* consumeAggregateFrontendWebSocketTicket({
          ...ticketStorage,
          ticket,
        }).pipe(Effect.result);
        expect(Result.isFailure(reused)).toBe(true);
        if (Result.isFailure(reused)) {
          expect(reused.failure.code).toBe(
            'aggregate-frontend-websocket-ticket-invalid',
          );
          expect(reused.failure.rawMessage).toBe(
            'Aggregate frontend WebSocket ticket is invalid or expired',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );
});
