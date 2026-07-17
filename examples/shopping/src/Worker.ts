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

    // Browser WebSocket upgrades are ordinary fetches. The loopback
    // SystemWorker consumes the short-lived ticket and resolves the private
    // FrontendBlockRepo target before forwarding the upgrade.
    if (url.pathname === '/ws-frontend-blocks') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const publishableKeys = url.searchParams.getAll('publishableKey');
      const tickets = url.searchParams.getAll('ticket');
      if (
        publishableKeys.length !== 1 ||
        publishableKeys[0] === undefined ||
        publishableKeys[0].length === 0 ||
        tickets.length !== 1 ||
        tickets[0] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(tickets[0])
      ) {
        return Response.json(
          { message: 'Missing or invalid WebSocket parameters' },
          { status: 400 },
        );
      }
      const systemWorker = this.ctx.exports.SystemWorker;
      if (systemWorker === undefined) {
        return new Response('Missing SystemWorker ctx.exports entrypoint', {
          status: 500,
        });
      }
      return systemWorker.fetch(request);
    }

    return newWorkersRpcResponse(request, shoppingApis);
  }
}
