import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import type { IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import type { AnyColumn } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { consumeAggregateFrontendWebSocketTicket } from '../consumeAggregateFrontendWebSocketTicket/consumeAggregateFrontendWebSocketTicket.js';
import { consumeServiceFrontendWebSocketTicket } from '../consumeServiceFrontendWebSocketTicket/consumeServiceFrontendWebSocketTicket.js';

export const fetch = Effect.fn('SystemRepo.fetch', { root: true })(
  function* (props: {
    db: IDb;
    request: Request;
    readiness: Promise<void>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      phase: AnyColumn;
    }>;
    aggregateFrontendWebSocketTicketTable: IAnyDrizzleSchema;
    aggregateFrontendWebSocketTicketColumns: Readonly<{
      expiresAt: AnyColumn;
      generationId: AnyColumn;
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
      generationId: AnyColumn;
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

    const systemLogPathMatch = url.pathname.match(
      /^\/ws-system-logs\/([^/]+)$/,
    );
    if (systemLogPathMatch !== null) {
      if (props.request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const generationId = decodeURIComponent(systemLogPathMatch[1] ?? '');
      return yield* makeAsync<Response>(() =>
        env.SYSTEM_LOG_AGENT.getByName(generationId).fetch(props.request),
      );
    }

    if (
      url.pathname === '/ws-aggregate-frontend-blocks' ||
      url.pathname === '/ws-service-frontend-blocks'
    ) {
      if (props.request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const tickets = url.searchParams.getAll('ticket');
      const ticket = tickets[0];
      const ticketParts = ticket?.split('.');
      const decodedGenerationId = Schema.decodeUnknownEither(
        makeAbbreviationIdSchema(coreAbbreviations.generation),
      )(ticketParts?.[0]);
      if (
        url.searchParams.size !== 1 ||
        tickets.length !== 1 ||
        ticket === undefined ||
        ticketParts?.length !== 2 ||
        ticketParts[1] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1]) ||
        Either.isLeft(decodedGenerationId)
      ) {
        return Response.json(
          { message: 'Missing or invalid WebSocket parameters' },
          { status: 400 },
        );
      }

      if (url.pathname === '/ws-service-frontend-blocks') {
        const settled = yield* consumeServiceFrontendWebSocketTicket({
          db: props.db,
          ticket,
          generationStateTable: props.generationStateTable,
          generationStateColumns: props.generationStateColumns,
          serviceFrontendWebSocketTicketTable:
            props.serviceFrontendWebSocketTicketTable,
          serviceFrontendWebSocketTicketColumns:
            props.serviceFrontendWebSocketTicketColumns,
        }).pipe(Effect.either);
        if (Either.isLeft(settled)) {
          return Response.json(
            {
              message:
                settled.left.code.endsWith('websocket-ticket-invalid') ||
                settled.left.code.startsWith('generation-')
                  ? 'WebSocket ticket is invalid or expired'
                  : 'Failed to admit WebSocket connection',
            },
            {
              status:
                settled.left.code.endsWith('websocket-ticket-invalid') ||
                settled.left.code.startsWith('generation-')
                  ? 401
                  : 500,
            },
          );
        }
        return yield* makeAsync(async () => {
          const forwardedHeaders = new Headers(props.request.headers);
          forwardedHeaders.set(
            'x-zerospin-service-name',
            settled.right.serviceName,
          );
          forwardedHeaders.set('x-zerospin-user-id', settled.right.userId);
          forwardedHeaders.set(
            'x-zerospin-frontend-name',
            settled.right.frontendName,
          );
          forwardedHeaders.set(
            'x-zerospin-service-frontend-lock',
            JSON.stringify(settled.right.serviceFrontendLock),
          );
          const response = await env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
            settled.right.repoName,
          ).fetch(new Request(props.request, { headers: forwardedHeaders }));
          if (!(response instanceof Response)) {
            throw new Error(
              'Service frontend block repo returned a non-Response result',
            );
          }
          return response;
        }).pipe(
          Effect.catchAll(() =>
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
        generationStateTable: props.generationStateTable,
        generationStateColumns: props.generationStateColumns,
        aggregateFrontendWebSocketTicketTable:
          props.aggregateFrontendWebSocketTicketTable,
        aggregateFrontendWebSocketTicketColumns:
          props.aggregateFrontendWebSocketTicketColumns,
      }).pipe(Effect.either);
      if (Either.isLeft(settled)) {
        return Response.json(
          {
            message:
              settled.left.code.endsWith('websocket-ticket-invalid') ||
              settled.left.code.startsWith('generation-')
                ? 'WebSocket ticket is invalid or expired'
                : 'Failed to admit WebSocket connection',
          },
          {
            status:
              settled.left.code.endsWith('websocket-ticket-invalid') ||
              settled.left.code.startsWith('generation-')
                ? 401
                : 500,
          },
        );
      }
      return yield* makeAsync(async () => {
        const forwardedHeaders = new Headers(props.request.headers);
        forwardedHeaders.set(
          'x-zerospin-aggregate-id',
          settled.right.aggregateId,
        );
        forwardedHeaders.set(
          'x-zerospin-aggregate-name',
          settled.right.aggregateName,
        );
        forwardedHeaders.set('x-zerospin-user-id', settled.right.userId);
        forwardedHeaders.set(
          'x-zerospin-frontend-name',
          settled.right.frontendName,
        );
        forwardedHeaders.set(
          'x-zerospin-aggregate-frontend-lock',
          JSON.stringify(settled.right.aggregateFrontendLock),
        );
        const response = await env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(
          settled.right.repoName,
        ).fetch(new Request(props.request, { headers: forwardedHeaders }));
        if (!(response instanceof Response)) {
          throw new Error(
            'Aggregate frontend block repo returned a non-Response result',
          );
        }
        return response;
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed(
            Response.json(
              { message: 'Failed to forward WebSocket connection' },
              { status: 500 },
            ),
          ),
        ),
      );
    }

    return Response.json(
      { message: 'SystemRepo accepts only reserved WebSocket routes' },
      { status: 404 },
    );
  },
);
