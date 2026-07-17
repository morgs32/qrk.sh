import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import type { IIdPrefix } from '@zerospin/core/test-utils/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { env } from 'cloudflare:workers';
import { Effect, Layer, Redacted } from 'effect';
import { system } from 'system';

import { SystemWorkerResolver } from '../SystemWorkerResolver/SystemWorkerResolver';
import { WorkerExportsSystemWorkerResolver } from '../SystemWorkerResolver/WorkerExportsSystemWorkerResolver';

const RPC_LOOPBACK_ORIGIN = 'http://zerospin-test-rpc.invalid';

export function makeWorkerdE2eTestLayer(idPrefix: IIdPrefix) {
  return Layer.mergeAll(
    Layer.effectDiscard(
      Effect.gen(function* () {
        // 1. Resolve the same loopback SystemWorker export used by the public
        //    test APIs. The examples exercise real admission, so their root
        //    generation must pass through the production lifecycle boundary.
        const resolver = yield* SystemWorkerResolver;
        using systemWorker = resolver.get({
          systemWorkerName: `${env.ZEROSPIN_SYSTEM_ID}:${env.ZEROSPIN_INSTANCE_ID}`,
        });

        // 2. Prepare the configured test generation from the example's full
        //    authored SystemSpec. Empty seeds are intentional: each workerd
        //    scenario owns the commands it wants to observe.
        yield* makeAsync(() =>
          systemWorker.prepareGeneration({
            deployId: env.ZEROSPIN_DEPLOY_ID,
            generationId: env.ZEROSPIN_GENERATION_ID,
            prevGenerationId: null,
            seeds: [],
            systemSpec: makeSystemSpec({ system }),
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        // 3. Open admission for exactly the deploy identity carried by every
        //    SystemApi and FrontendApi capability in this workerd isolate.
        yield* makeAsync(() =>
          systemWorker.openGeneration({
            deployId: env.ZEROSPIN_DEPLOY_ID,
            generationId: env.ZEROSPIN_GENERATION_ID,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
      }).pipe(
        Effect.provide(WorkerExportsSystemWorkerResolver),
        Effect.provide(AsyncLive),
      ),
    ),
    makePrefixedIncrementalIdFactory(idPrefix),
    IncrementalMonotonicFactory,
    ErrorLayer,
    TraceLoggerLayer,
    AsyncLive,
    Layer.succeed(ZerospinApisUrl, `${RPC_LOOPBACK_ORIGIN}/`),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  );
}
