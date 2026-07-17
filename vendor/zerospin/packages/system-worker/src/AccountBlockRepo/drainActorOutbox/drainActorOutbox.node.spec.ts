/*
 * System-worker annotation:
 * Exercises AccountBlockRepo.drainActorOutbox queue-runner behavior.
 */

import { it } from '@effect/vitest';
import type { IAccountCursor } from '@zerospin/core/models/types';
import { Effect, Either } from 'effect';
import { describe, expect } from 'vitest';

import type { refreshQueue } from '../refreshQueue/refreshQueue.js';

import { drainActorOutbox } from './drainActorOutbox.js';

describe('AccountBlockRepo.drainActorOutbox', () => {
  it.effect('goes idle when refresh returns no deliveries', () =>
    Effect.gen(function* () {
      const alarmWrites: number[] = [];
      const alarmDeletes: string[] = [];
      const storage = {
        get() {
          return Promise.resolve(undefined);
        },
        getAlarm() {
          return Promise.resolve(null);
        },
        setAlarm(alarmTime: number) {
          alarmWrites.push(alarmTime);
          return Promise.resolve();
        },
        deleteAlarm() {
          alarmDeletes.push('delete');
          return Promise.resolve();
        },
      } as unknown as DurableObjectStorage;
      const deliveriesByActorRepoName = new Map<
        string,
        Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
      >();
      const queuedActorRepoNames: string[] = [];
      let running: Promise<void> | null = null;

      yield* drainActorOutbox({
        storage,
        deliveriesByActorRepoName,
        queuedActorRepoNames,
        concurrency: 1,
        alarmDelayMs: 250,
        refresh: () => Effect.succeed([]),
        processSubscriber: () => Effect.succeed(null),
        getRunning: () => running,
        setRunning: nextRunning => {
          running = nextRunning;
        },
      });

      expect(alarmWrites).toHaveLength(1);
      expect(alarmDeletes).toEqual(['delete']);
      expect(deliveriesByActorRepoName.size).toBe(0);
      expect(queuedActorRepoNames).toEqual([]);
      expect(running).toBe(null);
    }),
  );

  it.effect(
    'dedupes refreshed deliveries by subscriber name before draining',
    () =>
      Effect.gen(function* () {
        const storage = {
          get() {
            return Promise.resolve(undefined);
          },
          getAlarm() {
            return Promise.resolve(null);
          },
          setAlarm() {
            return Promise.resolve();
          },
          deleteAlarm() {
            return Promise.resolve();
          },
        } as unknown as DurableObjectStorage;
        const deliveriesByActorRepoName = new Map<
          string,
          Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
        >();
        const queuedActorRepoNames: string[] = [];
        let running: Promise<void> | null = null;
        let refreshCount = 0;
        const processed: number[] = [];
        const firstDelivery = {
          subscriber: {
            actorRepoName: 'actrrepo_same',
            accountId: 'acct_queue',
            accountName: 'main',
            actorId: 'actr_same',
            actorName: 'actor',
            currentAccountCursor: null,
            currentAccountIndex: null,
            queuedAccountCursor: null,
            queuedAccountIndex: null,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: null,
          },
          blocks: [
            {
              pushedBlockId: null,
              lastAccountCursor: 'acur_101' as IAccountCursor,
              accountIndex: 101,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: [],
            },
          ],
        } satisfies Effect.Effect.Success<
          ReturnType<typeof refreshQueue>
        >[number];
        const secondDelivery = {
          subscriber: {
            actorRepoName: 'actrrepo_same',
            accountId: 'acct_queue',
            accountName: 'main',
            actorId: 'actr_same',
            actorName: 'actor',
            currentAccountCursor: null,
            currentAccountIndex: null,
            queuedAccountCursor: null,
            queuedAccountIndex: null,
            deliveryAttempts: 0,
            nextRetryAt: null,
            lastDeliveryError: null,
            failedAt: null,
            succeededAt: null,
          },
          blocks: [
            {
              pushedBlockId: null,
              lastAccountCursor: 'acur_102' as IAccountCursor,
              accountIndex: 102,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: [],
            },
          ],
        } satisfies Effect.Effect.Success<
          ReturnType<typeof refreshQueue>
        >[number];

        yield* drainActorOutbox({
          storage,
          deliveriesByActorRepoName,
          queuedActorRepoNames,
          concurrency: 1,
          alarmDelayMs: 250,
          refresh: () =>
            Effect.sync(() => {
              refreshCount += 1;
              if (refreshCount === 1) {
                return [firstDelivery, secondDelivery];
              }
              return [];
            }),
          processSubscriber: subscriberDelivery =>
            Effect.sync(() => {
              processed.push(subscriberDelivery.blocks[0]?.accountIndex ?? 0);
              return null;
            }),
          getRunning: () => running,
          setRunning: nextRunning => {
            running = nextRunning;
          },
        });

        expect(processed).toEqual([102]);
      }),
  );

  it.effect('shares active drain work across concurrent starts', () =>
    Effect.gen(function* () {
      const storage = {
        get() {
          return Promise.resolve(undefined);
        },
        getAlarm() {
          return Promise.resolve(null);
        },
        setAlarm() {
          return Promise.resolve();
        },
        deleteAlarm() {
          return Promise.resolve();
        },
      } as unknown as DurableObjectStorage;
      const deliveriesByActorRepoName = new Map<
        string,
        Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
      >();
      const queuedActorRepoNames: string[] = [];
      let running: Promise<void> | null = null;
      let refreshCount = 0;
      let releaseSubscriber: (() => void) | undefined;
      let markSubscriberStarted: (() => void) | undefined;
      const subscriberStarted = new Promise<void>(resolve => {
        markSubscriberStarted = resolve;
      });
      const delivery = {
        subscriber: {
          actorRepoName: 'actrrepo_sub_concurrent',
          accountId: 'acct_queue',
          accountName: 'main',
          actorId: 'actr_concurrent',
          actorName: 'actor',
          currentAccountCursor: null,
          currentAccountIndex: null,
          queuedAccountCursor: null,
          queuedAccountIndex: null,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
          failedAt: null,
          succeededAt: null,
        },
        blocks: [
          {
            pushedBlockId: null,
            lastAccountCursor: 'acur_201' as IAccountCursor,
            accountIndex: 201,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
          },
        ],
      } satisfies Effect.Effect.Success<
        ReturnType<typeof refreshQueue>
      >[number];
      const props = {
        storage,
        deliveriesByActorRepoName,
        queuedActorRepoNames,
        concurrency: 1,
        alarmDelayMs: 250,
        refresh: () =>
          Effect.sync(() => {
            refreshCount += 1;
            if (refreshCount === 1) {
              return [delivery];
            }
            return [];
          }),
        processSubscriber: () =>
          Effect.promise(async () => {
            markSubscriberStarted?.();
            await new Promise<void>(resolve => {
              releaseSubscriber = resolve;
            });
            return null;
          }),
        getRunning: () => running,
        setRunning: (nextRunning: Promise<void> | null) => {
          running = nextRunning;
        },
      };

      const firstStart = Effect.runPromise(drainActorOutbox(props));
      yield* Effect.promise(() => subscriberStarted);
      const secondStart = Effect.runPromise(drainActorOutbox(props));

      expect(refreshCount).toBe(1);
      expect(running).not.toBe(null);

      releaseSubscriber?.();
      yield* Effect.promise(() => Promise.all([firstStart, secondStart]));

      expect(running).toBe(null);
    }),
  );

  it.effect('clears running state after processor failure', () =>
    Effect.gen(function* () {
      const storage = {
        get() {
          return Promise.resolve(undefined);
        },
        getAlarm() {
          return Promise.resolve(null);
        },
        setAlarm() {
          return Promise.resolve();
        },
        deleteAlarm() {
          return Promise.resolve();
        },
      } as unknown as DurableObjectStorage;
      const deliveriesByActorRepoName = new Map<
        string,
        Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
      >();
      const queuedActorRepoNames: string[] = [];
      let running: Promise<void> | null = null;
      let refreshCount = 0;
      const delivery = {
        subscriber: {
          actorRepoName: 'actrrepo_sub_failure',
          accountId: 'acct_queue',
          accountName: 'main',
          actorId: 'actr_failure',
          actorName: 'actor',
          currentAccountCursor: null,
          currentAccountIndex: null,
          queuedAccountCursor: null,
          queuedAccountIndex: null,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
          failedAt: null,
          succeededAt: null,
        },
        blocks: [
          {
            pushedBlockId: null,
            lastAccountCursor: 'acur_301' as IAccountCursor,
            accountIndex: 301,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
          },
        ],
      } satisfies Effect.Effect.Success<
        ReturnType<typeof refreshQueue>
      >[number];

      const maybeDrained = yield* drainActorOutbox({
        storage,
        deliveriesByActorRepoName,
        queuedActorRepoNames,
        concurrency: 1,
        alarmDelayMs: 250,
        refresh: () =>
          Effect.sync(() => {
            refreshCount += 1;
            if (refreshCount === 1) {
              return [delivery];
            }
            return [];
          }),
        processSubscriber: () =>
          Effect.sync(() => {
            throw new Error('failed subscriber');
          }),
        getRunning: () => running,
        setRunning: nextRunning => {
          running = nextRunning;
        },
      }).pipe(Effect.either);

      expect(Either.isLeft(maybeDrained)).toBe(true);
      expect(running).toBe(null);
      expect(deliveriesByActorRepoName.size).toBe(0);
      expect(queuedActorRepoNames).toEqual([]);
    }),
  );

  it.effect('keeps an alarm after settle when refresh still finds work', () =>
    Effect.gen(function* () {
      const alarmWrites: number[] = [];
      const alarmDeletes: string[] = [];
      const storage = {
        get() {
          return Promise.resolve(undefined);
        },
        getAlarm() {
          return Promise.resolve(null);
        },
        setAlarm(alarmTime: number) {
          alarmWrites.push(alarmTime);
          return Promise.resolve();
        },
        deleteAlarm() {
          alarmDeletes.push('delete');
          return Promise.resolve();
        },
      } as unknown as DurableObjectStorage;
      const deliveriesByActorRepoName = new Map<
        string,
        Effect.Effect.Success<ReturnType<typeof refreshQueue>>[number]
      >();
      const queuedActorRepoNames: string[] = [];
      let running: Promise<void> | null = null;
      let refreshCount = 0;
      const delivery = {
        subscriber: {
          actorRepoName: 'actrrepo_sub_remaining',
          accountId: 'acct_queue',
          accountName: 'main',
          actorId: 'actr_remaining',
          actorName: 'actor',
          currentAccountCursor: null,
          currentAccountIndex: null,
          queuedAccountCursor: null,
          queuedAccountIndex: null,
          deliveryAttempts: 0,
          nextRetryAt: null,
          lastDeliveryError: null,
          failedAt: null,
          succeededAt: null,
        },
        blocks: [
          {
            pushedBlockId: null,
            lastAccountCursor: 'acur_401' as IAccountCursor,
            accountIndex: 401,
            executedCommands: [],
            failedCommands: [],
            appliedMutations: [],
          },
        ],
      } satisfies Effect.Effect.Success<
        ReturnType<typeof refreshQueue>
      >[number];

      yield* drainActorOutbox({
        storage,
        deliveriesByActorRepoName,
        queuedActorRepoNames,
        concurrency: 1,
        alarmDelayMs: 250,
        refresh: () =>
          Effect.sync(() => {
            refreshCount += 1;
            if (refreshCount === 1 || refreshCount === 3) {
              return [delivery];
            }
            return [];
          }),
        processSubscriber: () => Effect.succeed(null),
        getRunning: () => running,
        setRunning: nextRunning => {
          running = nextRunning;
        },
      });

      expect(alarmWrites).toHaveLength(2);
      expect(alarmDeletes).toEqual([]);
      expect(running).toBe(null);
    }),
  );
});
