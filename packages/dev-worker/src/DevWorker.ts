/* eslint-disable perfectionist/sort-exports */
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';
import { WorkerExportsSystemWorkerResolver } from 'system-worker/SystemWorkerResolver/WorkerExportsSystemWorkerResolver';

import { makeStaticApiKeyIdentityResolver } from './ApiKeyIdentityResolver/makeStaticApiKeyIdentityResolver.js';

const systemRuntime = makeSystemRuntime({
  systemWorkerResolver: WorkerExportsSystemWorkerResolver,
});
const apiKeyIdentityResolver = makeStaticApiKeyIdentityResolver({
  systemId: env.ZEROSPIN_SYSTEM_ID,
});

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
export default class DevWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (
      /^\/ws-system-logs\/[^/]+$/.test(url.pathname) ||
      url.pathname === '/ws-aggregate-frontend-blocks' ||
      url.pathname === '/ws-service-frontend-blocks'
    ) {
      return env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID).fetch(request);
    }
    return newWorkersRpcResponse(
      request,
      new GatewayApi({
        apiKeyIdentityResolver,
        environment: 'dev',
        runtime: systemRuntime,
        systemRepo: env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID),
      }),
    );
  }
}
