/* eslint-disable perfectionist/sort-exports */
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { env, WorkerEntrypoint } from 'cloudflare:workers';
import { Either, Schema } from 'effect';

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

    if (url.pathname === '/ws-frontend-blocks') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return Response.json(
          { message: 'Expected WebSocket upgrade' },
          { status: 426 },
        );
      }
      const publishableKeys = url.searchParams.getAll('publishableKey');
      const tickets = url.searchParams.getAll('ticket');
      const ticketParts = tickets[0]?.split('.');
      const decodedGenerationId = Schema.decodeUnknownEither(
        makeAbbreviationIdSchema(coreAbbreviations.generation),
      )(ticketParts?.[0]);
      if (
        publishableKeys.length !== 1 ||
        publishableKeys[0] === undefined ||
        publishableKeys[0].length === 0 ||
        tickets.length !== 1 ||
        tickets[0] === undefined ||
        ticketParts?.length !== 2 ||
        ticketParts[1] === undefined ||
        !/^[A-Za-z0-9_-]{43}$/.test(ticketParts[1]) ||
        Either.isLeft(decodedGenerationId)
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
