import { Effect } from 'effect';

/**
 * Provide AsyncLive at runPromise boundary — not in shared ManagedRuntime layers.
 *
 * @bad Merge AsyncLive into ManagedRuntime.make(Layer.mergeAll(...)) used everywhere.
 */
export const managedRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

export function runSystemDefinitionLoad(systemName: string) {
  return managedRuntime.runPromise(
    loadSystemDefinition({ systemName }).pipe(Effect.provide(AsyncLive)),
  );
}

export function runSystemRepoRead(systemName: string) {
  return managedRuntime.runPromise(
    Effect.gen(function* () {
      yield* makeAsync(() => systemRepo.findGeneration(systemName));
    }).pipe(Effect.provide(AsyncLive), encodeRpc),
  );
}

declare const ManagedRuntime: {
  make: (layer: unknown) => { runPromise: (e: unknown) => Promise<unknown> };
};
declare const Layer: { mergeAll: (...layers: unknown[]) => unknown };
declare const NanoIdFactory: unknown;
declare const UlidMonotonicFactory: unknown;
declare const AsyncLive: unknown;
declare function loadSystemDefinition(props: {
  systemName: string;
}): Effect.Effect<unknown, unknown, unknown>;
declare function makeAsync<A>(
  fn: () => Promise<A>,
): Effect.Effect<A, unknown, unknown>;
declare const systemRepo: {
  findGeneration: (systemName: string) => Promise<unknown>;
};
declare function encodeRpc(e: unknown): unknown;
