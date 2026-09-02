/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';

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
export default class DevWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (
      /^\/ws-system-logs\/[^/]+$/.test(url.pathname) ||
      url.pathname === '/ws-aggregate-frontend-commands' ||
      url.pathname === '/ws-service-frontend-commands'
    ) {
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
