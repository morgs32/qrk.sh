import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { VersionedAggregateRepo } from '../VersionedAggregateRepo.js';
import { versionedAggregateRepoDbConfig } from '../versionedAggregateRepoDbConfig.js';

it('never self-enrolls in AC after receipt failure or during alarm recovery', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateName: 'user',
    aggregateId: 'acct_subscription_recovery',
    aggregateVersion: '1.0.0',
  };
  const repo = await Effect.runPromise(
    VersionedAggregateRepo.getRepo({ key }).pipe(Effect.provide(AsyncLive)),
  );
  const subscriptionAttempts: number[] = [];
  await runInDurableObject(repo, async (instance, state) => {
    const subscriber = instance.versionedAggregateFanoutQueueSubscriber(key);
    const accessor =
      instance.versionedAggregateFanoutQueueSubscriber.bind(instance);
    vi.spyOn(
      instance,
      'versionedAggregateFanoutQueueSubscriber',
    ).mockImplementation(sourceKey => {
      subscriptionAttempts.push(1);
      return accessor(sourceKey);
    });
    const drained = Promise.withResolvers<void>();
    const drain = instance.executedCommands.drain;
    vi.spyOn(instance.executedCommands, 'drain').mockImplementation(() =>
      drain().pipe(Effect.ensuring(Effect.sync(() => drained.resolve()))),
    );

    const result = await subscriber.receive({
      lastIndex: 1,
      rows: [
        {
          aggregateIndex: 1,
          commandId: 'cmd_subscription_recovery',
          canonicalBytes: '{}',
          chainedAt: new Date(1),
          command: '{}',
        },
      ],
    });
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-admitted-input-invalid' },
    });
    await drained.promise;
    expect(await state.storage.getAlarm()).toBeNull();
    expect(subscriptionAttempts).toEqual([]);
  });

  // Queue-only alarms never add an AC subscription.
  await runDurableObjectAlarm(repo);
  expect(subscriptionAttempts).toEqual([]);
  expect(
    await runInDurableObject(repo, (_instance, state) =>
      state.storage.getAlarm(),
    ),
  ).toBeNull();
  expect(await repo.ready()).toEqual(encodeSuccess(undefined));
});

it('retains the original spec across cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateName: 'notes',
    aggregateId: 'acct_cold_spec',
    aggregateVersion: '1.0.0',
  };
  let repo = await Effect.runPromise(
    VersionedAggregateRepo.getRepo({ key }).pipe(Effect.provide(AsyncLive)),
  );
  expect(await repo.ready()).toEqual(encodeSuccess(undefined));
  const originalHead = await runInDurableObject(repo, instance =>
    instance.db.select().from(versionedAggregateRepoDbConfig.schema.head).get(),
  );
  expect(originalHead).toMatchObject({
    aggregateIndex: 0,
  });
  await abortAllDurableObjects();
  repo = await Effect.runPromise(
    VersionedAggregateRepo.getRepo({ key }).pipe(Effect.provide(AsyncLive)),
  );
  expect(await repo.ready()).toEqual(encodeSuccess(undefined));
  await runInDurableObject(repo, instance => {
    expect(
      instance.db
        .select()
        .from(versionedAggregateRepoDbConfig.schema.head)
        .get(),
    ).toEqual(originalHead);
  });
});
