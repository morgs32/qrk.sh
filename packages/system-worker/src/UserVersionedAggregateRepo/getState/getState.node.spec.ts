import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { Effect, Semaphore } from 'effect';
import { system } from 'system';
import { expect, it, vi } from 'vitest';

import {
  userVersionedAggregateRepoDbConfig,
  userVersionedAggregateRepoTables,
} from '../userVersionedAggregateRepoDbConfig.js';

import { getState } from './getState.js';

const published = vi.hoisted(() => ({ tip: 3, requested: 0 }));

vi.mock(
  '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../UserVersionedAggregateChain/UserVersionedAggregateChain.js')
      >();

    Object.assign(actual.UserVersionedAggregateChain, {
      getRepo: () =>
        Effect.succeed({
          getCommands: async (request: {
            reconcile: { throughUserIndex: number };
          }) => {
            published.requested = request.reconcile.throughUserIndex;
            return {
              _tag: 'Success',
              success: { tip: published.tip, commands: [] },
            };
          },
        }),
    });
    return actual;
  },
);

it('catches up without resubscribing and waits for the captured frontend index', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: userVersionedAggregateRepoTables,
        models: system.aggregates.user['1.0.0']!.models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  db.insert(userVersionedAggregateRepoDbConfig.schema.projectionState)
    .values({
      id: 1,
      aggregateIndex: 3,
      userIndex: 10,
      aggregateVersion: '1.0.0',
      canonicalBytes: '{}',
      graph: '[]',
    })
    .run();
  db.insert(userVersionedAggregateRepoDbConfig.schema.services)
    .values({
      serviceName: 'app',
      lastIndex: 7,
    })
    .run();
  const aggregateCatchup = vi.fn(async () => encodeSuccess(undefined));
  const serviceCatchup = vi.fn(async () => encodeSuccess(undefined));
  const subscribe = vi.fn(async () => encodeSuccess(undefined));
  const serviceSubscriber = vi.fn(() => ({
    catchup: serviceCatchup,
    subscribe,
  }));
  const drained: (number | undefined)[] = [];
  const key = {
    systemId: 'sys_snapshot',
    aggregateId: 'acct_snapshot',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'usr_a',
  };
  const props = {
    db,
    key,
    requested: { ...key, frontendName: 'main', outstandingCommandIds: [] },
    subscriber: { catchup: aggregateCatchup, subscribe },
    serviceSubscriber,
    execution: Semaphore.makeUnsafe(1),
    deltas: {
      drain: (index?: number) =>
        Effect.sync(() => {
          drained.push(index);
        }),
    },
  };
  const pending = await Effect.runPromise(
    getState(props).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(pending).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'replica-state-publication-pending' },
  });
  expect(published.requested).toBe(10);
  expect(drained).toEqual([undefined, 10]);
  published.tip = 10;
  const snapshot = await Effect.runPromise(
    getState(props).pipe(Effect.provide(AsyncLive)),
  );
  expect(snapshot).toMatchObject({
    aggregateIndex: 3,
    userIndex: 10,
    resources: [],
  });
  expect(aggregateCatchup).toHaveBeenCalledTimes(2);
  expect(serviceCatchup).toHaveBeenCalledTimes(4);
  expect(serviceSubscriber).toHaveBeenCalledWith({
    systemId: key.systemId,
    serviceName: 'app',
    serviceVersion: '1.0.0',
  });
  expect(serviceSubscriber).toHaveBeenCalledWith({
    systemId: key.systemId,
    serviceName: 'inventory',
    serviceVersion: '1.0.0',
  });
  expect(subscribe).not.toHaveBeenCalled();
});
