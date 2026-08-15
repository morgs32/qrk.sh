import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeStaticApiKeyIdentityResolver } from '@zerospin/dev-worker/makeStaticApiKeyIdentityResolver';
import { newWorkersRpcResponse } from 'capnweb';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';
import { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';
import { makeSystemRuntime } from 'system-worker/makeSystemRuntime';
import { WorkerExportsSystemWorkerResolver } from 'system-worker/SystemWorkerResolver/WorkerExportsSystemWorkerResolver';

const systemRuntime = makeSystemRuntime({
  systemWorkerResolver: WorkerExportsSystemWorkerResolver,
});
const apiKeyIdentityResolver = makeStaticApiKeyIdentityResolver({
  systemId: env.ZEROSPIN_SYSTEM_ID,
});

export { AggregateBlockRepo } from 'system-worker';
export { AggregateRepo } from 'system-worker';
export { AggregateFrontendBlockRepo } from 'system-worker';
export { AggregateFrontendRepo } from 'system-worker';
export { ServiceBlockRepo } from 'system-worker';
export { ServiceFrontendBlockRepo } from 'system-worker';
export { ServiceFrontendRepo } from 'system-worker';
export { ServiceRepo } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { SystemWorker } from 'system-worker';

// oxlint-disable-next-line import/no-default-export -- workerd fixture entrypoint
export default {
  async fetch(request: Request) {
    const systemRepo = env.SYSTEM_REPO.getByName(env.ZEROSPIN_SYSTEM_ID);
    const url = new URL(request.url);
    if (
      /^\/ws-system-logs\/[^/]+$/.test(url.pathname) ||
      url.pathname === '/ws-aggregate-frontend-blocks' ||
      url.pathname === '/ws-service-frontend-blocks'
    ) {
      return systemRepo.fetch(request);
    }

    if (url.pathname !== '/__test/system-repo-snapshot') {
      return newWorkersRpcResponse(
        request,
        new GatewayApi({
          apiKeyIdentityResolver,
          environment: 'dev',
          runtime: systemRuntime,
          systemRepo,
        }),
      );
    }

    const generationIds = url.searchParams.getAll('generationId');
    const [generationId] = generationIds;
    if (generationId === undefined) {
      return Response.json(
        { error: 'generationId query parameter is required' },
        { status: 400 },
      );
    }

    const [selection, deploySnapshots, generationSnapshots] = await Promise.all(
      [
        Effect.runPromise(
          Effect.promise(() =>
            systemRepo.getRepoTableRows({
              generationId,
              tableName: 'selection',
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ),
        Promise.all(
          generationIds.map(generationId =>
            Effect.runPromise(
              Effect.promise(() =>
                systemRepo.getRepoTableRows({
                  generationId,
                  tableName: 'deploy',
                }),
              ).pipe(Effect.flatMap(decodeRpc)),
            ),
          ),
        ),
        Promise.all(
          generationIds.map(generationId =>
            Effect.runPromise(
              Effect.promise(() =>
                systemRepo.getRepoTableRows({
                  generationId,
                  tableName: 'generationState',
                }),
              ).pipe(Effect.flatMap(decodeRpc)),
            ),
          ),
        ),
      ],
    );
    return Response.json({
      deploys: deploySnapshots.flatMap(snapshot => snapshot.rows),
      generations: generationSnapshots.flatMap(snapshot => snapshot.rows),
      selection: selection.rows,
    });
  },
};
