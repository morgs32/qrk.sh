/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import config from 'config';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

if (
  env.ZEROSPIN_SECRET_KEY.length === 0 ||
  env.ZEROSPIN_PUBLISHABLE_KEY.length === 0
) {
  throw new Error(
    'ProductionWorker requires non-empty ZEROSPIN_SECRET_KEY and ZEROSPIN_PUBLISHABLE_KEY',
  );
}

const systemRuntime = config.system.runtime;
export { AggregateChain } from 'system-worker';
export { AggregateActorVersionChain } from 'system-worker';
export { AggregateVersionChain } from 'system-worker';
export { ServiceVersionChain } from 'system-worker';
export { AggregateActorVersionRepo } from 'system-worker';
export { AggregateVersionRepo } from 'system-worker';
export { ServiceActorVersionRepo } from 'system-worker';
export { ServiceVersionRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { ServiceChain } from 'system-worker';
export { ServiceActorVersionChain } from 'system-worker';
export { SystemRepo } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class ProductionWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const isSystemLogSocket = /^\/ws-system-logs\/[^/]+$/.test(url.pathname);
    const isSessionSocket =
      url.pathname === '/ws-aggregate-session-commands' ||
      url.pathname === '/ws-service-session-commands';

    if (isSessionSocket) {
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

    if (isSystemLogSocket || isSessionSocket) {
      return env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).fetch(request);
    }
    const response = await newWorkersRpcResponse(
      request,
      new GatewayApi({
        runtime: systemRuntime,
      }),
    );
    response.headers.set(
      'X-Zerospin-Worker-Version',
      env.ZEROSPIN_VERSION_METADATA.id,
    );
    return response;
  }
}
