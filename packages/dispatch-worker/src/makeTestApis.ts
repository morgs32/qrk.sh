import { env } from 'cloudflare:workers';

import { makeStaticApiKeyIdentityResolver } from './ApiKeyIdentityResolver/makeStaticApiKeyIdentityResolver';
import { makeDispatchRuntime } from './makeDispatchRuntime';
import { WorkerExportsSystemWorkerResolver } from './SystemWorkerResolver/WorkerExportsSystemWorkerResolver';
import { ZerospinApis } from './ZerospinApis/ZerospinApis';

/**
 * The locally-wired gateway for workerd e2e tests: same-isolate SystemWorker
 * resolution, static dev identity from the exact configured worker bindings.
 */
export function makeTestApis(): ZerospinApis {
  return new ZerospinApis({
    deployId: env.ZEROSPIN_DEPLOY_ID,
    generationId: env.ZEROSPIN_GENERATION_ID,
    runtime: makeDispatchRuntime({
      systemWorkerResolver: WorkerExportsSystemWorkerResolver,
      apiKeyIdentityResolver: makeStaticApiKeyIdentityResolver({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        clerkUserId: env.ZEROSPIN_INSTANCE_ID,
      }),
    }),
  });
}
