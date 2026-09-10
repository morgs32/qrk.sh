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
/*
 * Gateway capabilities use this runtime for ID generation and the async
 * bridge. Its layers can initialize synchronously in the Worker boundary.
 *
 * 1. Create the capability runtime.
 */
export function makeSystemRuntime(): ISystemRuntime {
  // 1 — merge NanoIdFactory, UlidMonotonicFactory, and AsyncLive
  return ManagedRuntime.make(
    Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, AsyncLive),
  );
}
