import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import type { IIdPrefix } from '@zerospin/core/test-utils/types';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { Layer, Redacted } from 'effect';

const RPC_LOOPBACK_ORIGIN = 'http://zerospin-test-rpc.invalid';

export function makeWorkerdE2eTestLayer(idPrefix: IIdPrefix) {
  return Layer.mergeAll(
    makePrefixedIncrementalIdFactory(idPrefix),
    IncrementalMonotonicFactory,
    ErrorLayer,
    TraceLoggerLayer,
    AsyncLive,
    Layer.succeed(ZerospinApiUrl, `${RPC_LOOPBACK_ORIGIN}/`),
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  );
}
