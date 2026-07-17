import { getAgentByName } from 'agents';
import { newWorkersRpcResponse } from 'capnweb';

import { FixtureSyncRpcApi } from './FixtureSyncRpcApi.js';

export { FixtureStateRepo, type ISnapshot } from './FixtureStateRepo.js';
export { FixtureSyncAgent } from './FixtureSyncAgent.js';
export { FixtureSyncRpcApi } from './FixtureSyncRpcApi.js';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/rpc') {
      return newWorkersRpcResponse(request, new FixtureSyncRpcApi(env));
    }

    if (url.pathname.startsWith('/ws/sync/')) {
      const name = decodeURIComponent(url.pathname.slice('/ws/sync/'.length));
      const agent = await getAgentByName(env.FIXTURE_SYNC_AGENT, name);
      return agent.fetch(request);
    }

    return new Response('not found', { status: 404 });
  },
};
