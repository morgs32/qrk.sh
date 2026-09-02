import { Effect, ManagedRuntime, type Layer } from 'effect';

export const acquireTestRuntime = <SERVICES, ERROR>(
  layer: Layer.Layer<SERVICES, ERROR>,
) =>
  Effect.acquireRelease(
    Effect.sync(() => ManagedRuntime.make(layer)),
    runtime => runtime.disposeEffect,
  );
