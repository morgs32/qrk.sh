import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import type { IIdPrefix } from '@zerospin/core/test-utils/types';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { Effect, Layer, Redacted } from 'effect';

import { makeTestGateway } from '../makeTestGateway.js';

const RPC_LOOPBACK_ORIGIN = 'http://zerospin-test-rpc.invalid';

export function makeWorkerdE2eTestLayer(idPrefix: IIdPrefix) {
  return Layer.mergeAll(
    Layer.effectDiscard(
      Effect.gen(function* () {
        // Activate the statically bundled System, then dispose the real
        // DevWorker-hosted Gateway transport opened by the test helper.
        const { gatewayApi } = yield* makeAsync(makeTestGateway);
        gatewayApi[Symbol.dispose]();
      }).pipe(Effect.provide(AsyncLive)),
    ),
    makePrefixedIncrementalIdFactory(idPrefix),
    IncrementalMonotonicFactory,
    ErrorLayer,
    TraceLoggerLayer,
    AsyncLive,
    Layer.succeed(ZerospinApiUrl, `${RPC_LOOPBACK_ORIGIN}/`),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  );
}
