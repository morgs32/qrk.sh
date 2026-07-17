/* eslint-disable perfectionist/sort-exports */
import { env, WorkerEntrypoint } from 'cloudflare:workers';

import { makeSystemWorkerName } from './makeSystemWorkerName';

export { AccountBlockRepo } from 'system-worker';
export { AccountRepo } from 'system-worker';
export { ActorRepo } from 'system-worker';
export { ActorBlockRepo } from 'system-worker';
export { FrontendRepo } from 'system-worker';
export { FrontendBlockRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { AuthorizationRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';
export { DevZerospinApis } from './DevZerospinApis/DevZerospinApis';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class E2eWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/ws-subscriber/')) {
      const encodedName = decodeURIComponent(
        url.pathname.slice('/ws-subscriber/'.length),
      );
      const name = encodedName.startsWith('/')
        ? encodedName.slice(1)
        : encodedName;
      return env.FRONTEND_BLOCK_REPO.getByName(name).fetch(request);
    }

    const devZerospinApisNamespace = this.ctx.exports.DevZerospinApis;
    if (devZerospinApisNamespace === undefined) {
      return new Response(
        'Missing DevZerospinApis ctx.exports Durable Object namespace',
        { status: 500 },
      );
    }

    if (env.ZEROSPIN_INSTANCE_ID.length === 0) {
      return new Response('Missing ZEROSPIN_INSTANCE_ID', { status: 500 });
    }

    const devZerospinApis = devZerospinApisNamespace.getByName(
      makeSystemWorkerName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        instanceId: env.ZEROSPIN_INSTANCE_ID,
      }),
    );
    return devZerospinApis.fetch(request);
  }
}
