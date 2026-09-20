import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { Layer, ManagedRuntime } from 'effect';

import { BrowserBackup } from '../BrowserBackup/BrowserBackup';

export type IZerospinRuntime<APP_SERVICES = never> =
  ManagedRuntime.ManagedRuntime<
    Async | BrowserBackup | CuidFactory | MonotonicFactory | APP_SERVICES,
    IAnyError
  >;

/**
 * Caller-owned application runtime. Supplies NanoId, monotonic-ID, Async, and
 * a lazy browser-backup connection together with the caller's application
 * services. No system binding or session registry.
 */
export function makeRuntime<APP_SERVICES = never>(props: {
  layer: Layer.Layer<APP_SERVICES, IAnyError>;
}): IZerospinRuntime<APP_SERVICES> {
  const { layer: applicationLayer } = props;
  if (
    Object.getPrototypeOf(applicationLayer) !==
    Object.getPrototypeOf(Layer.empty)
  ) {
    throw new ZerospinError({
      code: 'zerospin-app-effect-runtime-mismatch',
      message:
        'The application layer was created by a different Effect runtime than Zerospin React. Ensure the app and Zerospin resolve to the same Effect installation, then rebuild.',
    });
  }
  return ManagedRuntime.make(
    Layer.mergeAll(
      NanoIdFactory,
      UlidMonotonicFactory,
      AsyncLive,
      BrowserBackup.layer,
      applicationLayer,
    ),
  );
}
