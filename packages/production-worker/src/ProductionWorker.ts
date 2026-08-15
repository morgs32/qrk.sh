/* eslint-disable perfectionist/sort-exports */
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError } from '@zerospin/error';
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Effect, Either, Schema } from 'effect';
import type { IApiKeyIdentityResolver } from 'system-worker/ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';
import { WorkerExportsSystemWorkerResolver } from 'system-worker/SystemWorkerResolver/WorkerExportsSystemWorkerResolver';

if (
  env.ZEROSPIN_SECRET_KEY.length === 0 ||
  env.ZEROSPIN_PUBLISHABLE_KEY.length === 0
) {
  throw new Error(
    'ProductionWorker requires non-empty ZEROSPIN_SECRET_KEY and ZEROSPIN_PUBLISHABLE_KEY',
  );
}

const systemRuntime = makeSystemRuntime({
  systemWorkerResolver: WorkerExportsSystemWorkerResolver,
});
const apiKeyIdentityResolver = {
  resolve: ({ apiKey }) => {
    if (apiKey === env.ZEROSPIN_SECRET_KEY) {
      return Effect.succeed({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        systemEnvironmentId: 'production',
        systemWorkerName: env.ZEROSPIN_SYSTEM_ID,
        keyType: 'secret',
      });
    }
    if (apiKey === env.ZEROSPIN_PUBLISHABLE_KEY) {
      return Effect.succeed({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        systemEnvironmentId: 'production',
        systemWorkerName: env.ZEROSPIN_SYSTEM_ID,
        keyType: 'publishable',
      });
    }
    return Effect.fail(
      new ZerospinError({
        code: 'production-api-key-invalid',
        message: 'The API key does not match this production deployment',
        status: 401,
      }),
    );
  },
} satisfies IApiKeyIdentityResolver;

export { AggregateBlockRepo } from 'system-worker';
export { AggregateRepo } from 'system-worker';
export { AggregateFrontendRepo } from 'system-worker';
export { AggregateFrontendBlockRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { ServiceFrontendRepo } from 'system-worker';
export { ServiceFrontendBlockRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class ProductionWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isSystemLogSocket = /^\/ws-system-logs\/[^/]+$/.test(url.pathname);
    const isFrontendSocket =
      url.pathname === '/ws-aggregate-frontend-blocks' ||
      url.pathname === '/ws-service-frontend-blocks';

    if (isFrontendSocket) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const tickets = url.searchParams.getAll('ticket');
      const ticketParts = tickets[0]?.split('.');
      const decodedGenerationId = Schema.decodeUnknownEither(
        makeAbbreviationIdSchema(coreAbbreviations.generation),
      )(ticketParts?.[0]);
      if (
        url.searchParams.size !== 1 ||
        tickets.length !== 1 ||
        tickets[0] === undefined ||
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
    }

    if (isSystemLogSocket || isFrontendSocket) {
      return env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).fetch(request);
    }
    return newWorkersRpcResponse(
      request,
      new GatewayApi({
        apiKeyIdentityResolver,
        environment: 'production',
        runtime: systemRuntime,
        systemRepo: env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID),
      }),
    );
  }
}
