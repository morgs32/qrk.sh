import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, Result } from 'effect';

import { FrontendServiceChain } from '../../FrontendServiceChain/FrontendServiceChain.js';
import { UserVersionedAggregateChain } from '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { consumeAggregateFrontendWebSocketTicket } from '../consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from '../consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';

/*
 * Entrypoint WebSocket requests reach the singleton SystemRepo router.
 * Frontend upgrades spend a retained ticket before forwarding to its log, while
 * the system-log route delegates directly to SystemLogAgent.
 *
 * 1. Parse the request after the common Repo activation gate.
 * 2. Route system-log upgrades.
 * 3. Reject unsupported routes and non-upgrades.
 * 4. Validate the frontend ticket query.
 * 5. Spend and forward a service frontend ticket.
 * 6. Spend the aggregate frontend ticket.
 * 7. Resolve the exact retained versioned frontend log.
 * 8. Forward the aggregate upgrade with retained admission fields.
 */
export const fetch = Effect.fn('SystemRepo.fetch', { root: true })(
  function* (props: {
    db: IDb;
    systemId: string;
    request: Request;
    aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
    aggregateFrontendWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      ticketHash: AnyColumn;
      repoName: AnyColumn;
      aggregateId: AnyColumn;
      aggregateName: AnyColumn;
      aggregateVersion: AnyColumn;
      userId: AnyColumn;
      frontendName: AnyColumn;
      aggregateFrontendLock: AnyColumn;
    }>;
    serviceFrontendWebSocketTicketTable: IAnyDrizzleSchema;
    serviceFrontendWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      ticketHash: AnyColumn;
      repoName: AnyColumn;
      serviceName: AnyColumn;
      serviceVersion: AnyColumn;
      userId: AnyColumn;
      frontendName: AnyColumn;
      serviceFrontendLock: AnyColumn;
    }>;
  }): Effect.fn.Return<Response, IAnyError, Async> {
    const {
      aggregateFrontendWebSocketTicketColumns,
      aggregateFrontendWebSocketTicketTable,
      db,
      request,
      serviceFrontendWebSocketTicketColumns,
      serviceFrontendWebSocketTicketTable,
      systemId,
    } = props;

    // 1 — incoming requests already passed the common Repo activation gate
    const url = new URL(request.url);

    // 2 — require Upgrade websocket and forward to SystemLogAgent(systemId)
    if (url.pathname === '/ws-system-logs') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      return yield* makeAsync<Response>(() =>
        env.SYSTEM_LOG_AGENT.getByName(systemId).fetch(request),
      );
    }

    // 3 — return 404 for unknown paths or 426 without the websocket upgrade
    if (
      url.pathname !== '/ws-aggregate-frontend-commands' &&
      url.pathname !== '/ws-service-frontend-commands'
    ) {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json(
        { message: 'Expected WebSocket upgrade' },
        { status: 426 },
      );
    }

    // 4 — require one ticket parameter and exactly 43 base64url characters
    const tickets = url.searchParams.getAll('ticket');
    const ticket = tickets[0];
    if (
      url.searchParams.size !== 1 ||
      tickets.length !== 1 ||
      ticket === undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket)
    ) {
      return Response.json(
        { message: 'Missing or invalid WebSocket parameters' },
        { status: 400 },
      );
    }

    // 5 — map consumption errors and replace forwarding headers from the retained ticket
    if (url.pathname === '/ws-service-frontend-commands') {
      const settled = yield* consumeServiceFrontendWebSocketTicket({
        db,
        ticket,
        serviceFrontendWebSocketTicketTable,
        serviceFrontendWebSocketTicketColumns,
      }).pipe(Effect.result);
      if (Result.isFailure(settled)) {
        return Response.json(
          {
            message: settled.failure.code.endsWith('websocket-ticket-invalid')
              ? 'WebSocket ticket is invalid or expired'
              : 'Failed to admit WebSocket connection',
          },
          {
            status: settled.failure.code.endsWith('websocket-ticket-invalid')
              ? 401
              : (settled.failure.status ?? 500),
          },
        );
      }
      const repo = yield* FrontendServiceChain.getRepo({
        key: {
          systemId,
          serviceName: settled.success.serviceName,
          serviceVersion: settled.success.serviceVersion,
          userId: settled.success.userId,
          frontendName: settled.success.frontendName,
        },
      });
      return yield* makeAsync(async () => {
        const headers = new Headers(request.headers);
        headers.set('x-zerospin-service-name', settled.success.serviceName);
        headers.set(
          'x-zerospin-service-version',
          settled.success.serviceVersion,
        );
        headers.set('x-zerospin-user-id', settled.success.userId);
        headers.set('x-zerospin-frontend-name', settled.success.frontendName);
        headers.set(
          'x-zerospin-service-frontend-lock',
          JSON.stringify(settled.success.serviceFrontendLock),
        );
        const response = await repo.fetch(new Request(request, { headers }));
        if (!(response instanceof Response)) {
          throw new Error(
            'Service frontend finalized command chain returned a non-Response result',
          );
        }
        return response;
      }).pipe(
        Effect.catch(() =>
          Effect.succeed(
            Response.json(
              { message: 'Failed to forward WebSocket connection' },
              { status: 500 },
            ),
          ),
        ),
      );
    }

    // 6 — return invalid/expired or storage failure before opening the frontend log
    const settled = yield* consumeAggregateFrontendWebSocketTicket({
      db,
      ticket,
      aggregateFrontendWebSocketTicketTable,
      aggregateFrontendWebSocketTicketColumns,
    }).pipe(Effect.result);
    if (Result.isFailure(settled)) {
      return Response.json(
        {
          message: settled.failure.code.endsWith('websocket-ticket-invalid')
            ? 'WebSocket ticket is invalid or expired'
            : 'Failed to admit WebSocket connection',
        },
        {
          status: settled.failure.code.endsWith('websocket-ticket-invalid')
            ? 401
            : (settled.failure.status ?? 500),
        },
      );
    }

    // 7 — parse repoName from the spent ticket, preserving the snapshot-selected version
    const key =
      yield* UserVersionedAggregateChain.fixedDORepoConfig.nameUtils.parseName(
        settled.success.repoName,
      );
    const repo = yield* UserVersionedAggregateChain.getRepo({ key });

    // 8 — replace aggregate/user/frontend headers and map forwarding failure to HTTP 500
    return yield* makeAsync(async () => {
      const headers = new Headers(request.headers);
      headers.set('x-zerospin-aggregate-id', settled.success.aggregateId);
      headers.set('x-zerospin-aggregate-name', settled.success.aggregateName);
      headers.set(
        'x-zerospin-aggregate-version',
        settled.success.aggregateVersion,
      );
      headers.set('x-zerospin-user-id', settled.success.userId);
      headers.set('x-zerospin-frontend-name', settled.success.frontendName);
      headers.set(
        'x-zerospin-aggregate-frontend-lock',
        JSON.stringify(settled.success.aggregateFrontendLock),
      );
      const response = await repo.fetch(new Request(request, { headers }));
      if (!(response instanceof Response)) {
        throw new Error(
          'Aggregate frontend finalized command chain returned a non-Response result',
        );
      }
      return response;
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          Response.json(
            { message: 'Failed to forward WebSocket connection' },
            { status: 500 },
          ),
        ),
      ),
    );
  },
);
