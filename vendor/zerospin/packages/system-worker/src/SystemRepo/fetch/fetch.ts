import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, Result } from 'effect';

import { getAggregateFrontendFinalizedCommandChain } from '../../AggregateFrontendFinalizedCommandChain/getAggregateFrontendFinalizedCommandChain/getAggregateFrontendFinalizedCommandChain.js';
import { getServiceFrontendFinalizedCommandChain } from '../../ServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain/getServiceFrontendFinalizedCommandChain.js';
import { consumeAggregateFrontendWebSocketTicket } from '../consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from '../consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';

export const fetch = Effect.fn('SystemRepo.fetch', { root: true })(
  function* (props: {
    db: IDb;
    systemId: string;
    request: Request;
    readiness: Promise<void>;
    aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
    aggregateFrontendWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      ticketHash: AnyColumn;
      repoName: AnyColumn;
      aggregateId: AnyColumn;
      aggregateName: AnyColumn;
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
      userId: AnyColumn;
      frontendName: AnyColumn;
      serviceFrontendLock: AnyColumn;
    }>;
  }): Effect.fn.Return<Response, IAnyError, Async> {
    yield* makeAsync(() => props.readiness);
    const url = new URL(props.request.url);

    if (url.pathname === '/ws-system-logs') {
      if (props.request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      return yield* makeAsync<Response>(() =>
        env.SYSTEM_LOG_AGENT.getByName(props.systemId).fetch(props.request),
      );
    }

    if (
      url.pathname !== '/ws-aggregate-frontend-commands' &&
      url.pathname !== '/ws-service-frontend-commands'
    ) {
      return new Response('Not found', { status: 404 });
    }
    if (props.request.headers.get('Upgrade') !== 'websocket') {
      return Response.json(
        { message: 'Expected WebSocket upgrade' },
        { status: 426 },
      );
    }
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

    if (url.pathname === '/ws-service-frontend-commands') {
      const settled = yield* consumeServiceFrontendWebSocketTicket({
        db: props.db,
        ticket,
        serviceFrontendWebSocketTicketTable:
          props.serviceFrontendWebSocketTicketTable,
        serviceFrontendWebSocketTicketColumns:
          props.serviceFrontendWebSocketTicketColumns,
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
      const repo = yield* getServiceFrontendFinalizedCommandChain({
        key: {
          systemId: props.systemId,
          serviceName: settled.success.serviceName,
          userId: settled.success.userId,
          frontendName: settled.success.frontendName,
        },
      });
      return yield* makeAsync(async () => {
        const headers = new Headers(props.request.headers);
        headers.set('x-zerospin-service-name', settled.success.serviceName);
        headers.set('x-zerospin-user-id', settled.success.userId);
        headers.set('x-zerospin-frontend-name', settled.success.frontendName);
        headers.set(
          'x-zerospin-service-frontend-lock',
          JSON.stringify(settled.success.serviceFrontendLock),
        );
        const response = await repo.fetch(
          new Request(props.request, { headers }),
        );
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

    const settled = yield* consumeAggregateFrontendWebSocketTicket({
      db: props.db,
      ticket,
      aggregateFrontendWebSocketTicketTable:
        props.aggregateFrontendWebSocketTicketTable,
      aggregateFrontendWebSocketTicketColumns:
        props.aggregateFrontendWebSocketTicketColumns,
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
    const repo = yield* getAggregateFrontendFinalizedCommandChain({
      key: {
        systemId: props.systemId,
        aggregateName: settled.success.aggregateName,
        aggregateId: settled.success.aggregateId,
        userId: settled.success.userId,
        frontendName: settled.success.frontendName,
      },
    });
    return yield* makeAsync(async () => {
      const headers = new Headers(props.request.headers);
      headers.set('x-zerospin-aggregate-id', settled.success.aggregateId);
      headers.set('x-zerospin-aggregate-name', settled.success.aggregateName);
      headers.set('x-zerospin-user-id', settled.success.userId);
      headers.set('x-zerospin-frontend-name', settled.success.frontendName);
      headers.set(
        'x-zerospin-aggregate-frontend-lock',
        JSON.stringify(settled.success.aggregateFrontendLock),
      );
      const response = await repo.fetch(
        new Request(props.request, { headers }),
      );
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
