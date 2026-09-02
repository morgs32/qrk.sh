import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import type { CuidFactory } from '@zerospin/schema';
import { Layer, ManagedRuntime } from 'effect';

export type ISystemRuntime = ManagedRuntime.ManagedRuntime<
  Async | CuidFactory | MonotonicFactory,
  never
>;

// Do not attach makePostHogLogsLayer here: OtlpLogger.layer is Scope/async and
// breaks ManagedRuntime under Workers (AsyncFiberException / runSync).
export function makeSystemRuntime(): ISystemRuntime {
  return ManagedRuntime.make(
    Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, AsyncLive),
  );
}
