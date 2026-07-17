import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Layer, ManagedRuntime } from 'effect';

import type { ApiKeyIdentityResolver } from './ApiKeyIdentityResolver/ApiKeyIdentityResolver';
import type { SystemWorkerResolver } from './SystemWorkerResolver/SystemWorkerResolver';

export type IDispatchRuntime = ManagedRuntime.ManagedRuntime<
  | Async
  | CuidFactory
  | MonotonicFactory
  | SystemWorkerResolver
  | ApiKeyIdentityResolver,
  never
>;

// Do not attach makePostHogLogsLayer here: OtlpLogger.layer is Scope/async and
// breaks ManagedRuntime under Workers (AsyncFiberException / runSync).
export function makeDispatchRuntime(props: {
  systemWorkerResolver: Layer.Layer<SystemWorkerResolver>;
  apiKeyIdentityResolver: Layer.Layer<ApiKeyIdentityResolver>;
}): IDispatchRuntime {
  return ManagedRuntime.make(
    Layer.mergeAll(
      NanoIdFactory,
      UlidMonotonicFactory,
      AsyncLive,
      props.systemWorkerResolver,
      props.apiKeyIdentityResolver,
    ),
  );
}
