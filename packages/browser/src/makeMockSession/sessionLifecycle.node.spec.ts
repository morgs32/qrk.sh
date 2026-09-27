import { it } from '@effect/vitest';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeZerospinError } from '@zerospin/error';
import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMockServiceSession } from './makeMockServiceSession';

class Instance extends Context.Service<Instance, { id: number }>()(
  'SessionLifecycleInstance',
) {}
const definition = makeServiceSessionDefinition({
  serviceName: 'test',
  serviceVersion: '1.0.0',
  actorName: 'reader',
  actorVersion: '1.0.0',
  sessionName: 'reader',
  models: {},
  claimsSchema: Schema.Struct({ user: Schema.String }),
});

function fixture(
  layer: Layer.Layer<Instance, ReturnType<typeof makeZerospinError>>,
) {
  return makeMockServiceSession({
    definition,
    claims: { user: 'test' },
    layer,
  });
}

describe('session-owned runtime lifetimes', () => {
  it('retains the diagnostic for an incompatible Effect installation', () => {
    const layer = Layer.succeed(Instance, { id: 1 });
    Object.setPrototypeOf(layer, {});
    expect(() => fixture(layer)).toThrow('different Effect runtime');
  });

  it('constructs lazily, isolates acquisitions, and replaces the runtime on reinitialization', async () => {
    let acquired = 0;
    const released: number[] = [];
    const layer = Layer.effect(
      Instance,
      Effect.acquireRelease(
        Effect.sync(() => ({ id: ++acquired })),
        value =>
          Effect.sync(() => {
            released.push(value.id);
          }),
      ),
    );
    const first = fixture(layer);
    const second = fixture(layer);
    const runtime = first.runtime;
    expect(first.runtime).toBe(runtime);
    expect(acquired).toBe(0);
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      expect(first.runtime.runSync(Instance).id).toBe(1);
      expect(second.runtime.runSync(Instance).id).toBe(2);
      expect(acquired).toBe(2);
      expect(() => first.initialize()).toThrow('active initialization owner');
      await first.dispose();
      await first.dispose();
      expect(released).toEqual([1]);
      expect(first.store.getState()).toMatchObject({
        sessionStatus: 'released',
        isInitialized: false,
      });
      expect(first.runtime).toBe(runtime);
      expect(() => runtime.runSync(Instance)).toThrow(
        'ManagedRuntime disposed',
      );
      expect(second.store.getState().isInitialized).toBe(true);
      const store = first.store;
      await first.initialize();
      expect(first.store).toBe(store);
      expect(first.runtime).not.toBe(runtime);
      expect(first.runtime.runSync(Instance).id).toBe(3);
    } finally {
      await Promise.all([first.dispose(), second.dispose()]);
    }
    expect(released.sort()).toEqual([1, 2, 3]);
  });

  it('disposes services acquired directly before initialization', async () => {
    let released = 0;
    const session = fixture(
      Layer.effect(
        Instance,
        Effect.acquireRelease(Effect.succeed({ id: 1 }), () =>
          Effect.sync(() => {
            released++;
          }),
        ),
      ),
    );
    await session.runtime.runPromise(Instance);
    await session.dispose();
    await session.dispose();
    expect(released).toBe(1);
    expect(session.store.getState().sessionStatus).toBe('released');
  });

  it('cleans failed layer acquisition and permits a fresh initialization', async () => {
    let attempts = 0;
    let released = 0;
    const session = fixture(
      Layer.effect(
        Instance,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              released++;
            }),
          );
          if (++attempts === 1) {
            return yield* makeZerospinError('test-startup-failed');
          }
          return { id: attempts };
        }),
      ),
    );
    const initial = session.runtime;
    await expect(session.initialize()).rejects.toMatchObject({
      code: 'test-startup-failed',
    });
    expect(released).toBe(1);
    expect(session.store.getState().sessionStatus).toBe('released');
    try {
      await session.initialize();
      expect(session.runtime).not.toBe(initial);
      expect(session.runtime.runSync(Instance).id).toBe(2);
    } finally {
      await session.dispose();
    }
    expect(released).toBe(2);
  });

  it('cancels pending acquisition and settles readiness without publishing stale state', async () => {
    const entered = Promise.withResolvers<void>();
    let acquisitions = 0;
    let releases = 0;
    const session = fixture(
      Layer.effect(
        Instance,
        Effect.gen(function* () {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              releases++;
            }),
          );
          if (++acquisitions === 1) {
            entered.resolve();
            yield* Effect.never;
          }
          return { id: acquisitions };
        }),
      ),
    );
    const started = session.initialize();
    const rejected = expect(started).rejects.toMatchObject({
      code: 'session-initialization-canceled',
    });
    await entered.promise;
    const disposing = session.dispose();
    const restarted = session.initialize();
    await Promise.all([disposing, rejected, restarted]);
    expect(releases).toBe(1);
    expect(session.runtime.runSync(Instance).id).toBe(2);
    expect(session.store.getState().isInitialized).toBe(true);
    await session.dispose();
    expect(releases).toBe(2);
  });

  it('serializes slow cleanup, canceled remounts, and the surviving remount', async () => {
    const releasing = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let acquisitions = 0;
    let releases = 0;
    const session = fixture(
      Layer.effect(
        Instance,
        Effect.acquireRelease(
          Effect.sync(() => ({ id: ++acquisitions })),
          value =>
            Effect.promise(async () => {
              if (value.id === 1) {
                releasing.resolve();
                await release.promise;
              }
              releases++;
            }),
        ),
      ),
    );
    await session.initialize();
    const original = session.runtime;
    const firstDisposal = session.dispose();
    await releasing.promise;
    const canceled = session.initialize();
    const rejected = expect(canceled).rejects.toMatchObject({
      code: 'session-initialization-canceled',
    });
    const secondDisposal = session.dispose();
    const surviving = session.initialize();
    expect(acquisitions).toBe(1);
    expect(session.runtime).toBe(original);
    release.resolve();
    await Promise.all([firstDisposal, secondDisposal, rejected, surviving]);
    expect(acquisitions).toBe(2);
    expect(releases).toBe(1);
    expect(session.store.getState().isInitialized).toBe(true);
    await session.dispose();
    expect(releases).toBe(2);
  });
});
