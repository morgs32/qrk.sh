import { makeDispatchRuntime } from '@zerospin/dispatch-worker/makeDispatchRuntime';
/* eslint-disable perfectionist/sort-exports */
import { makeStaticApiKeyIdentityResolver } from '@zerospin/dispatch-worker/makeStaticApiKeyIdentityResolver';
import { WorkerExportsSystemWorkerResolver } from '@zerospin/dispatch-worker/WorkerExportsSystemWorkerResolver';
import { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { newWorkersRpcResponse } from 'capnweb';
import { env, WorkerEntrypoint } from 'cloudflare:workers';

// These named exports are the Durable Object classes referenced by this
// example's wrangler.jsonc. SystemWorker is a loopback Worker export, so the
// public API boundary never opens a Workers for Platforms dispatch namespace.
export { AccountBlockRepo } from 'system-worker';
export { AccountRepo } from 'system-worker';
export { ActorRepo } from 'system-worker';
export { ActorBlockRepo } from 'system-worker';
export { FrontendRepo } from 'system-worker';
export { FrontendBlockRepo } from 'system-worker';
export { AuthorizationRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

// Shopping owns its API key strings. The static resolver still supplies the
// identity shape required by ZerospinApis, but deliberately performs no Clerk
// verification or prefix classification for this standalone example.
const shoppingApis = new ZerospinApis({
  deployId: env.ZEROSPIN_DEPLOY_ID,
  generationId: env.ZEROSPIN_GENERATION_ID,
  runtime: makeDispatchRuntime({
    systemWorkerResolver: WorkerExportsSystemWorkerResolver,
    apiKeyIdentityResolver: makeStaticApiKeyIdentityResolver({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      deployName: 'shopping-example',
      clerkUserId: 'shopping-example',
      keyType: 'secret',
    }),
  }),
});

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class ShoppingWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Browser websocket subscriptions are regular Worker fetches rather than
    // Cap'n Web RPC calls. Forward the encoded Durable Object name unchanged.
    if (url.pathname.startsWith('/ws-subscriber/')) {
      const encodedName = decodeURIComponent(
        url.pathname.slice('/ws-subscriber/'.length),
      );
      const name = encodedName.startsWith('/')
        ? encodedName.slice(1)
        : encodedName;
      return env.FRONTEND_BLOCK_REPO.getByName(name).fetch(request);
    }

    return newWorkersRpcResponse(request, shoppingApis);
  }
}
