import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Cause, Effect, Exit } from 'effect';
import invariant from 'tiny-invariant';

/*
 * Repo recovery operations share one Durable Object alarm through named
 * registrations and in-memory leases. Registration is inert; each alarm runs
 * every operation against durable state, including after a cold activation.
 * Every hold schedules a fresh alarm; releasing one queue deletes the alarm only
 * when no other queue still holds a lease.
 *
 * 1. Track recovery operations and queue lease names.
 * 2. Hold or renew a queue alarm.
 * 3. Release one queue lease.
 * 4. Register one lazy recovery Effect per name.
 * 5. Settle all recovery operations independently before reporting failures.
 */
export const makeAlarmRegistry = (props: {
  storage: Pick<DurableObjectStorage, 'setAlarm' | 'deleteAlarm'>;
}) => {
  const { storage } = props;

  // 1 — keep independent queue ownership in one Set
  const leases = new Set<string>();
  const operations = new Map<string, Effect.Effect<void, IAnyError, Async>>();

  return {
    hold: Effect.fn('AlarmRegistry.hold')(function* (key: string) {
      // 2 — schedule Date.now() plus one second even when the lease already exists
      leases.add(key);
      // A fired alarm is consumed even while its lease remains held.
      yield* Effect.promise(() => storage.setAlarm(Date.now() + 1_000));
    }) as (key: string) => Effect.Effect<void, IAnyError, Async>,
    release: Effect.fn('AlarmRegistry.release')(function* (key: string) {
      // 3 — delete the storage alarm only after the last lease is removed
      leases.delete(key);
      if (leases.size === 0) {
        yield* Effect.promise(() => storage.deleteAlarm());
      }
    }) as (key: string) => Effect.Effect<void, IAnyError, Async>,
    register(
      name: string,
      effect: Effect.Effect<void, IAnyError, Async>,
    ): void {
      // 4 — construction binds work without touching storage or running it
      invariant(
        !operations.has(name),
        `Alarm operation already registered: ${name}`,
      );
      operations.set(name, effect);
    },
    run: Effect.fn('AlarmRegistry.run')(function* () {
      // 5 — a failure must not interrupt another registered operation
      const exits = yield* Effect.forEach(
        [...operations.values()],
        operation => Effect.exit(operation),
        { concurrency: 'unbounded' },
      );
      let failure: Cause.Cause<IAnyError> | undefined;
      for (const exit of exits) {
        if (Exit.isFailure(exit)) {
          failure =
            failure === undefined
              ? exit.cause
              : Cause.combine(failure, exit.cause);
        }
      }
      if (failure !== undefined) return yield* Effect.failCause(failure);
    }),
  };
};

export type IAlarmRegistry = ReturnType<typeof makeAlarmRegistry>;
