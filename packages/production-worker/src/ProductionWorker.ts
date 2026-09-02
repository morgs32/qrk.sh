/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';

if (
  env.ZEROSPIN_SECRET_KEY.length === 0 ||
  env.ZEROSPIN_PUBLISHABLE_KEY.length === 0
) {
  throw new Error(
    'ProductionWorker requires non-empty ZEROSPIN_SECRET_KEY and ZEROSPIN_PUBLISHABLE_KEY',
  );
}

const systemRuntime = makeSystemRuntime();
export { AggregateCommandChain } from 'system-worker';
export { AggregateFrontendFinalizedCommandChain } from 'system-worker';
export { AggregateFrontendPushedCommandChain } from 'system-worker';
export { MaterializedAggregateFrontendRepo } from 'system-worker';
export { MaterializedAggregateRepo } from 'system-worker';
export { MaterializedServiceFrontendRepo } from 'system-worker';
export { MaterializedServiceRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { ServiceCommandChain } from 'system-worker';
export { ServiceFrontendFinalizedCommandChain } from 'system-worker';
export { SystemRepo } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class ProductionWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isSystemLogSocket = /^\/ws-system-logs\/[^/]+$/.test(url.pathname);
    const isFrontendSocket =
      url.pathname === '/ws-aggregate-frontend-commands' ||
      url.pathname === '/ws-service-frontend-commands';

    if (isFrontendSocket) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const tickets = url.searchParams.getAll('ticket');
      if (
        url.searchParams.size !== 1 ||
        tickets.length !== 1 ||
        tickets[0] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(tickets[0])
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
        runtime: systemRuntime,
      }),
    );
  }
}
