import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, Result } from 'effect';

import { AggregateActorVersionChain } from '../../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { ServiceActorVersionChain } from '../../ServiceActorVersionChain/ServiceActorVersionChain.js';
import { consumeAggregateSessionWebSocketTicket } from '../consumeAggregateSessionWebSocketTicket/consumeAggregateSessionWebSocketTicket.js';
import { consumeServiceSessionWebSocketTicket } from '../consumeServiceSessionWebSocketTicket/consumeServiceSessionWebSocketTicket.js';

/*
 * Entrypoint WebSocket requests reach the singleton SystemRepo router.
 * Session upgrades spend a retained ticket before forwarding to its log, while
 * the system-log route delegates directly to SystemLogAgent.
 *
 * 1. Parse the request after the common Repo activation gate.
 * 2. Route system-log upgrades.
 * 3. Reject unsupported routes and non-upgrades.
 * 4. Validate the definition ticket query.
 * 5. Spend and forward a service definition ticket.
 * 6. Spend the aggregate definition ticket.
 * 7. Resolve the exact retained versioned definition log.
 * 8. Forward identity and the definition lock.
 */
export const fetch = Effect.fn('SystemRepo.fetch', { root: true })(
  function* (props: {
    db: IDb;
    systemId: string;
    request: Request;
    aggregateSessionWebSocketTicketTable: IAnyDrizzleSchema;
    aggregateSessionWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      ticketHash: AnyColumn;
      repoName: AnyColumn;
      aggregateId: AnyColumn;
      aggregateName: AnyColumn;
      aggregateVersion: AnyColumn;
      actorName: AnyColumn;
      actorVersion: AnyColumn;
      actorPath: AnyColumn;
      identity: AnyColumn;
      sessionName: AnyColumn;
      aggregateSessionLock: AnyColumn;
    }>;
    serviceSessionWebSocketTicketTable: IAnyDrizzleSchema;
    serviceSessionWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      ticketHash: AnyColumn;
      repoName: AnyColumn;
      serviceName: AnyColumn;
      serviceVersion: AnyColumn;
      actorPath: AnyColumn;
      identity: AnyColumn;
      sessionName: AnyColumn;
      serviceSessionLock: AnyColumn;
    }>;
  }): Effect.fn.Return<Response, IAnyError, Async> {
    const {
      aggregateSessionWebSocketTicketColumns,
      aggregateSessionWebSocketTicketTable,
      db,
      request,
      serviceSessionWebSocketTicketColumns,
      serviceSessionWebSocketTicketTable,
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
      url.pathname !== '/ws-aggregate-session-commands' &&
      url.pathname !== '/ws-service-session-commands'
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
    if (url.pathname === '/ws-service-session-commands') {
      const settled = yield* consumeServiceSessionWebSocketTicket({
        db,
        ticket,
        serviceSessionWebSocketTicketTable,
        serviceSessionWebSocketTicketColumns,
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
      const repo = yield* ServiceActorVersionChain.getRepo({
        key: {
          systemId,
          serviceName: settled.success.serviceName,
          serviceVersion: settled.success.serviceVersion,
          actorPath: settled.success.actorPath,
          actorName: settled.success.serviceSessionLock.actorName,
          actorVersion: settled.success.serviceSessionLock.actorVersion,
        },
      });
      return yield* makeAsync(async () => {
        const headers = new Headers(request.headers);
        headers.set('x-zerospin-service-name', settled.success.serviceName);
        headers.set(
          'x-zerospin-service-version',
          settled.success.serviceVersion,
        );
        headers.set('x-zerospin-actor-path', settled.success.actorPath);
        headers.set(
          'x-zerospin-identity',
          JSON.stringify(settled.success.identity),
        );
        headers.set('x-zerospin-session-name', settled.success.sessionName);
        headers.set(
          'x-zerospin-service-session-lock',
          JSON.stringify(settled.success.serviceSessionLock),
        );
        const response = await repo.fetch(new Request(request, { headers }));
        if (!(response instanceof Response)) {
          throw new Error(
            'Service definition actor-command chain returned a non-Response result',
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

    // 6 — return invalid/expired or storage failure before opening the definition log
    const settled = yield* consumeAggregateSessionWebSocketTicket({
      db,
      ticket,
      aggregateSessionWebSocketTicketTable,
      aggregateSessionWebSocketTicketColumns,
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
      yield* AggregateActorVersionChain.fixedDORepoConfig.nameUtils.parseName(
        settled.success.repoName,
      );
    const repo = yield* AggregateActorVersionChain.getRepo({ key });

    // 8 — forward identity and the definition lock; map forwarding failure to HTTP 500
    return yield* makeAsync(async () => {
      const headers = new Headers(request.headers);
      headers.delete('x-zerospin-aggregate-id');
      headers.delete('x-zerospin-aggregate-name');
      headers.delete('x-zerospin-aggregate-version');
      headers.delete('x-zerospin-actor-name');
      headers.delete('x-zerospin-actor-version');
      headers.delete('x-zerospin-actor-path');
      headers.delete('x-zerospin-session-name');
      headers.set(
        'x-zerospin-identity',
        JSON.stringify(settled.success.identity),
      );
      headers.set(
        'x-zerospin-aggregate-session-lock',
        JSON.stringify(settled.success.aggregateSessionLock),
      );
      const response = await repo.fetch(new Request(request, { headers }));
      if (!(response instanceof Response)) {
        throw new Error(
          'Aggregate definition actor-command chain returned a non-Response result',
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
