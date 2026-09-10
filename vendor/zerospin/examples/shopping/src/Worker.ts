/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';

const systemRuntime = makeSystemRuntime();
export { AggregateChain } from 'system-worker';
export { UserVersionedAggregateChain } from 'system-worker';
export { VersionedAggregateChain } from 'system-worker';
export { VersionedServiceChain } from 'system-worker';
export { UserVersionedAggregateRepo } from 'system-worker';
export { VersionedAggregateRepo } from 'system-worker';
export { FrontendVersionedServiceRepo } from 'system-worker';
export { VersionedServiceRepo } from 'system-worker';
export { ServiceAdmittedChain } from 'system-worker';
export { FrontendServiceChain } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class ShoppingWorker extends WorkerEntrypoint {
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
