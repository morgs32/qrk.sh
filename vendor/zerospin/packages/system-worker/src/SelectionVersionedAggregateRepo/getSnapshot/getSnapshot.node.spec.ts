import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import config from 'config';
import { Effect, Semaphore } from 'effect';
import { expect, it, vi } from 'vitest';

import {
  selectionVersionedAggregateRepoDbConfig,
  selectionVersionedAggregateRepoTables,
} from '../selectionVersionedAggregateRepoDbConfig.js';

import { getSnapshot } from './getSnapshot.js';

const { system } = config;

const published = vi.hoisted(() => ({ tip: 3, requested: 0 }));

vi.mock(
  '../../SelectionVersionedAggregateChain/SelectionVersionedAggregateChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../SelectionVersionedAggregateChain/SelectionVersionedAggregateChain.js')
      >();

    Object.assign(actual.SelectionVersionedAggregateChain, {
      getRepo: () =>
        Effect.succeed({
          getSelectedCommands: async (request: {
            reconcile: { throughSelectionIndex: number };
          }) => {
            published.requested = request.reconcile.throughSelectionIndex;
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
        otherTables: selectionVersionedAggregateRepoTables,
        models: system.aggregates.user['1.0.0']!.models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  db.insert(selectionVersionedAggregateRepoDbConfig.schema.projectionState)
    .values({
      id: 1,
      aggregateIndex: 3,
      selectionIndex: 10,
                  selectionHash: 'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      aggregateVersion: '1.0.0',
      canonicalBytes: '{}',
      graph: '[]',
    })
    .run();
  db.insert(selectionVersionedAggregateRepoDbConfig.schema.services)
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
    selectionPath: createHref(RoutePattern.parse('/:userId'), {
      userId: 'usr_a',
    }),
  };
  const props = {
    db,
    key,
    requested: { ...key, frontendName: 'main', pendingCommandIds: [] },
    subscriber: { catchup: aggregateCatchup, subscribe },
    serviceSubscriber,
    execution: Semaphore.makeUnsafe(1),
    selectedCommands: {
      drain: (index?: number) =>
        Effect.sync(() => {
          drained.push(index);
        }),
    },
  };
  const pending = await Effect.runPromise(
    getSnapshot(props).pipe(Effect.result, Effect.provide(AsyncLive)),
  );
  expect(pending).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'replica-state-publication-pending' },
  });
  expect(published.requested).toBe(10);
  expect(drained).toEqual([undefined, 10]);
  published.tip = 10;
  const snapshot = await Effect.runPromise(
    getSnapshot(props).pipe(Effect.provide(AsyncLive)),
  );
  expect(snapshot).toMatchObject({
    aggregateIndex: 3,
    selectionIndex: 10,
                  selectionHash: 'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
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
