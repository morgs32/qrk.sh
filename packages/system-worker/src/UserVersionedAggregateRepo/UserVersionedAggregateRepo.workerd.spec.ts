import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect } from 'effect';
import { system } from 'system';
import { expect, it } from 'vitest';

import { VersionedAggregateRepo } from '../VersionedAggregateRepo/VersionedAggregateRepo.js';

import { UserVersionedAggregateRepo } from './UserVersionedAggregateRepo.js';
import { userVersionedAggregateRepoDbConfig } from './userVersionedAggregateRepoDbConfig.js';

it('declares sources before resource enrollment and validates them across cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_source_binding',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'usr_source_binding',
  };
  const sourceKey = {
    systemId: key.systemId,
    serviceName: 'app',
    serviceVersion: '1.0.0',
  };
  const repo = await Effect.runPromise(
    UserVersionedAggregateRepo.getRepo({ key }).pipe(Effect.provide(AsyncLive)),
  );

  await runInDurableObject(repo, instance => {
    expect(
      instance.db
        .select()
        .from(userVersionedAggregateRepoDbConfig.schema.services)
        .all()
        .map(row => row.serviceName)
        .sort(),
    ).toEqual(['app', 'inventory']);
    expect(
      instance.db
        .select()
        .from(system.aggregates.user['1.0.0']!.models.product.drizzleSchema)
        .all(),
    ).toEqual([]);
  });

  for (const cold of [false, true]) {
    if (cold) await abortAllDurableObjects();
    const activeRepo = await Effect.runPromise(
      UserVersionedAggregateRepo.getRepo({ key }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    await runInDurableObject(activeRepo, instance => {
      for (const invalid of [
        { ...sourceKey, systemId: 'sys_other' },
        { ...sourceKey, serviceName: 'missing' },
        { ...sourceKey, serviceVersion: '2.0.0' },
      ]) {
        expect(() =>
          instance.aggregateReplicaFanoutQueueSubscriber(invalid),
        ).toThrowError(
          expect.objectContaining({ code: 'replica-source-not-enrolled' }),
        );
      }
      expect(
        instance.aggregateReplicaFanoutQueueSubscriber(sourceKey).name,
      ).toBe('aggregateReplicaFanoutQueue');
    });
  }
});

it('requires an enrolled VAR source even when an RPC caller omits the service version', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_missing_source_binding',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
  };
  const repo = await Effect.runPromise(
    VersionedAggregateRepo.getRepo({ key }).pipe(Effect.provide(AsyncLive)),
  );
  await runInDurableObject(repo, instance => {
    expect(
      instance.aggregateFanoutQueueSubscriber({
        systemId: key.systemId,
        serviceName: 'app',
        serviceVersion: '1.0.0',
      }).name,
    ).toBe('aggregateFanoutQueue');
    expect(() =>
      // @ts-expect-error RPC callers can supply a key without its required serviceVersion.
      instance.aggregateFanoutQueueSubscriber({
        systemId: key.systemId,
        serviceName: 'app',
      }),
    ).toThrowError(expect.objectContaining({ code: 'replica-source-invalid' }));
  });
});
