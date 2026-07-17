/*
 * System-worker annotation:
 * Implements the managedRuntime.ts managed Runtime operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { Layer, ManagedRuntime } from 'effect';

// Do not attach makePostHogLogsLayer here: OtlpLogger is Scope/async and DO
// constructors use managedRuntime.runSync (initialize / wireRepoInternals).
export const managedRuntime: ManagedRuntime.ManagedRuntime<
  Async | CuidFactory | MonotonicFactory,
  never
> = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory, ErrorLayer, AsyncLive),
);
