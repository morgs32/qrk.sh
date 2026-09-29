/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import config from 'config';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

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
export { AggregateMachineRepo, ServiceMachineRepo } from './machineRepos.js';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class DevWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (
      /^\/ws-system-logs\/[^/]+$/.test(url.pathname) ||
      url.pathname === '/ws-aggregate-session-commands' ||
      url.pathname === '/ws-service-session-commands'
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
