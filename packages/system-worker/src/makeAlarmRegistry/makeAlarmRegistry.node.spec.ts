import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ZerospinError } from '@zerospin/error';
import { Cause, Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeAlarmRegistry } from './makeAlarmRegistry.js';

describe('makeAlarmRegistry', () => {
  it('registers without touching storage and runs every operation without leases', async () => {
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const registry = makeAlarmRegistry({ storage: { setAlarm, deleteAlarm } });
    const recover = vi.fn();
    registry.register(
      'recovery',
      Effect.sync(() => {
        recover();
      }),
    );
    expect(recover).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
    expect(deleteAlarm).not.toHaveBeenCalled();
    expect(() => registry.register('recovery', Effect.void)).toThrow(
      'Alarm operation already registered: recovery',
    );
    await Effect.runPromise(registry.run().pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(registry.run().pipe(Effect.provide(AsyncLive)));
    expect(recover).toHaveBeenCalledTimes(2);
    expect(setAlarm).not.toHaveBeenCalled();
    expect(deleteAlarm).not.toHaveBeenCalled();
  });

  it('settles concurrent work before reporting both typed failures and defects', async () => {
    const registry = makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    });
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const completed = vi.fn();
    registry.register(
      'failed',
      Effect.fail(new ZerospinError({ code: 'alarm-typed-failure' })),
    );
    registry.register('defect', Effect.die(new Error('alarm-defect')));
    registry.register(
      'slow',
      Effect.gen(function* () {
        started.resolve();
        yield* Effect.promise(() => finish.promise);
        completed();
      }),
    );
    let settled = false;
    const running = Effect.runPromise(
      registry.run().pipe(Effect.exit, Effect.provide(AsyncLive)),
    ).then(exit => {
      settled = true;
      return exit;
    });
    await started.promise;
    expect(settled).toBe(false);
    expect(completed).not.toHaveBeenCalled();
    finish.resolve();
    const exit = await running;
    expect(completed).toHaveBeenCalledTimes(1);
    if (exit._tag !== 'Failure') throw new Error('Expected both failures');
    expect(exit.cause.reasons).toHaveLength(2);
    expect(Cause.pretty(exit.cause)).toContain('alarm-typed-failure');
    expect(Cause.pretty(exit.cause)).toContain('alarm-defect');
  });

  it("keeps another operation's wakeup while successful delivery releases its lease", async () => {
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const registry = makeAlarmRegistry({ storage: { setAlarm, deleteAlarm } });
    const subscribed = Promise.withResolvers<void>();
    const delivered = Promise.withResolvers<void>();
    registry.register(
      'subscription',
      Effect.gen(function* () {
        yield* registry.hold('subscription');
        yield* Effect.promise(() => subscribed.promise);
        yield* registry.release('subscription');
      }),
    );
    registry.register(
      'delivery',
      Effect.gen(function* () {
        yield* registry.hold('delivery');
        yield* registry.release('delivery');
        delivered.resolve();
      }),
    );
    const running = Effect.runPromise(
      registry.run().pipe(Effect.provide(AsyncLive)),
    );
    await delivered.promise;
    expect(deleteAlarm).not.toHaveBeenCalled();
    subscribed.resolve();
    await running;
    expect(deleteAlarm).toHaveBeenCalledTimes(1);
  });

  it('rearms held work and deletes only after last release', async () => {
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const registry = makeAlarmRegistry({
      storage: { setAlarm, deleteAlarm },
    });

    await Effect.runPromise(registry.hold('a').pipe(Effect.provide(AsyncLive)));
    expect(setAlarm).toHaveBeenCalledTimes(1);
    await Effect.runPromise(registry.hold('b').pipe(Effect.provide(AsyncLive)));
    expect(setAlarm).toHaveBeenCalledTimes(2);
    await Effect.runPromise(registry.hold('a').pipe(Effect.provide(AsyncLive)));
    expect(setAlarm).toHaveBeenCalledTimes(3);

    await Effect.runPromise(
      registry.release('a').pipe(Effect.provide(AsyncLive)),
    );
    expect(deleteAlarm).not.toHaveBeenCalled();
    await Effect.runPromise(
      registry.release('b').pipe(Effect.provide(AsyncLive)),
    );
    expect(deleteAlarm).toHaveBeenCalledTimes(1);
  });

  it('leaves the alarm set when a holder never releases', async () => {
    const setAlarm = vi.fn(async () => undefined);
    const deleteAlarm = vi.fn(async () => undefined);
    const registry = makeAlarmRegistry({
      storage: { setAlarm, deleteAlarm },
    });

    await Effect.runPromise(registry.hold('a').pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(registry.hold('b').pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(
      registry.release('a').pipe(Effect.provide(AsyncLive)),
    );
    expect(deleteAlarm).not.toHaveBeenCalled();
  });
});
