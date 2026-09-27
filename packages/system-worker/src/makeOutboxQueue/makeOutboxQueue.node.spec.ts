import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeZerospinError } from '@zerospin/error';
import { Effect, type Scope } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { aggregateActorVersionRepoDbConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';
import { makeActorSnapshotDb } from '../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { game } from '../workerd-utils/automationFixture.js';

import { makeOutboxQueue } from './makeOutboxQueue.js';

const run = <A, E>(effect: Effect.Effect<A, E, Async | Scope.Scope>) =>
  Effect.runPromise(effect.pipe(Effect.provide(AsyncLive), Effect.scoped));

describe('outbox drainAfter', () => {
  it('republishes a retained row when acknowledgement fails after delivery', async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models: { automationGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const retained = { id: 'cmd_confirmed', index: 1 };
        let acknowledged = false;
        let failAcknowledgement = true;
        const delivered = vi.fn();
        const alarms = makeAlarmRegistry({
          storage: {
            setAlarm: vi.fn(async () => {}),
            deleteAlarm: vi.fn(async () => {}),
          },
        });
        const queue = makeOutboxQueue({
          name: 'retainedPublication',
          db,
          outboxTable: aggregateActorVersionRepoDbConfig.schema.commands,
          indexColumnName: 'executedIndex',
          alarmRegistry: alarms,
          retention: 'retain',
          storage: {
            hasPending: () => !acknowledged,
            readPage: () =>
              acknowledged ? [] : [{ index: retained.index, row: retained }],
            recordFailure: () => {},
            acknowledge: (_indices, retention) => {
              expect(retention).toBe('retain');
              if (failAcknowledgement) {
                failAcknowledgement = false;
                throw new Error('acknowledgement unavailable');
              }
              acknowledged = true;
            },
          },
          deliver: () =>
            Effect.sync(() => {
              delivered();
            }),
        });
        const first = yield* Effect.exit(queue.drain());
        expect(first._tag).toBe('Failure');
        expect(delivered).toHaveBeenCalledTimes(1);
        expect(acknowledged).toBe(false);
        yield* alarms.run();
        expect(delivered).toHaveBeenCalledTimes(2);
        expect(acknowledged).toBe(true);
        expect(retained).toEqual({ id: 'cmd_confirmed', index: 1 });
      }),
    );
  });

  it('starts delivery without an alarm and returns while the receiver is blocked', async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models: { automationGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const pending: number[] = [];
        let release!: () => void;
        const receiver = vi.fn(
          () =>
            new Promise<void>(resolve => {
              release = resolve;
            }),
        );
        const storage = {
          setAlarm: vi.fn(async () => {}),
          deleteAlarm: vi.fn(async () => {}),
        };
        const queue = makeOutboxQueue({
          name: 'testOutbox',
          db,
          outboxTable: aggregateActorVersionRepoDbConfig.schema.pendingCommands,
          indexColumnName: 'stageIndex',
          alarmRegistry: makeAlarmRegistry({ storage }),
          retention: 'delete',
          storage: {
            hasPending: () => pending.length > 0,
            readPage: () => pending.map(index => ({ index, row: { index } })),
            recordFailure: () => {},
            acknowledge: indices => {
              for (const index of indices) {
                pending.splice(pending.indexOf(index), 1);
              }
            },
          },
          deliver: () => Effect.promise(() => receiver()),
        });
        const result = yield* queue.drainAfter(() =>
          Effect.sync(() => {
            pending.push(1);
            return 'committed';
          }),
        );
        expect(result).toBe('committed');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(1)),
        );
        expect(pending).toEqual([1]);
        expect(storage.deleteAlarm).not.toHaveBeenCalled();
        yield* queue.drainAfter(() =>
          Effect.sync(() => {
            pending.push(2);
          }),
        );
        expect(pending).toEqual([1, 2]);
        release();
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(receiver).toHaveBeenCalledTimes(2)),
        );
        expect(pending).toEqual([2]);
        release();
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(pending).toEqual([])),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(storage.deleteAlarm).toHaveBeenCalled()),
        );
      }),
    );
  });

  it('preserves producer failure while delivering committed rows', async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models: { automationGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const pending: number[] = [];
        const delivered = vi.fn();
        const secondStarted = vi.fn();
        let releaseSecond!: () => void;
        let interruptNext = false;
        const attempts = vi.fn();
        const storage = {
          setAlarm: vi.fn(async () => {}),
          deleteAlarm: vi.fn(async () => {}),
        };
        const alarms = makeAlarmRegistry({ storage });
        const queue = makeOutboxQueue({
          name: 'testOutboxFailure',
          db,
          outboxTable: aggregateActorVersionRepoDbConfig.schema.pendingCommands,
          indexColumnName: 'stageIndex',
          alarmRegistry: alarms,
          retention: 'delete',
          storage: {
            hasPending: () => pending.length > 0,
            readPage: () => pending.map(index => ({ index, row: { index } })),
            recordFailure: () => {},
            acknowledge: () => {
              pending.length = 0;
            },
          },
          deliver: () => {
            attempts();
            if (interruptNext) return Effect.interrupt;
            return pending[0] === 2
              ? Effect.promise(() => {
                  secondStarted();
                  return new Promise<void>(resolve => {
                    releaseSecond = resolve;
                  });
                }).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      delivered();
                    }),
                  ),
                )
              : Effect.sync(() => {
                  delivered();
                });
          },
        });
        const failed = yield* Effect.exit(
          queue.drainAfter(() =>
            Effect.sync(() => {
              pending.push(1);
            }).pipe(
              Effect.flatMap(() =>
                Effect.fail(makeZerospinError('producer-failed')),
              ),
            ),
          ),
        );
        expect(failed._tag).toBe('Failure');
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(delivered).toHaveBeenCalledTimes(1)),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(pending).toEqual([])),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(storage.deleteAlarm).toHaveBeenCalledTimes(1),
          ),
        );
        const interrupted = yield* Effect.exit(
          queue.drainAfter(() =>
            Effect.gen(function* () {
              pending.push(2);
              return yield* Effect.interrupt;
            }),
          ),
        );
        expect(interrupted._tag).toBe('Failure');
        expect(pending).toEqual([2]);
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(secondStarted).toHaveBeenCalledTimes(1)),
        );
        expect(pending).toEqual([2]);
        releaseSecond();
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(delivered).toHaveBeenCalledTimes(2)),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(pending).toEqual([])),
        );
        interruptNext = true;
        yield* queue.drainAfter(() =>
          Effect.sync(() => {
            pending.push(3);
          }),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(attempts).toHaveBeenCalledTimes(3)),
        );
        expect(pending).toEqual([3]);
        interruptNext = false;
        yield* alarms.run();
        expect(pending).toEqual([]);
      }),
    );
  });

  it('does not run the producer or delivery when the initial alarm fails', async () => {
    await run(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          makeResourceDbConfig({
            models: { automationGame: game },
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        );
        const producer = vi.fn();
        const receiver = vi.fn();
        const queue = makeOutboxQueue({
          name: 'testOutboxAlarmFailure',
          db,
          outboxTable: aggregateActorVersionRepoDbConfig.schema.pendingCommands,
          indexColumnName: 'stageIndex',
          alarmRegistry: makeAlarmRegistry({
            storage: {
              setAlarm: async () => {
                throw new Error('alarm unavailable');
              },
              deleteAlarm: async () => {},
            },
          }),
          retention: 'delete',
          storage: {
            hasPending: () => false,
            readPage: () => [],
            recordFailure: () => {},
            acknowledge: () => {},
          },
          deliver: () =>
            Effect.sync(() => {
              receiver();
            }),
        });
        const failed = yield* Effect.exit(
          queue.drainAfter(() =>
            Effect.sync(() => {
              producer();
            }),
          ),
        );
        expect(failed._tag).toBe('Failure');
        expect(producer).not.toHaveBeenCalled();
        expect(receiver).not.toHaveBeenCalled();
      }),
    );
  });
});
