import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { makeFanoutSubscriber } from '../../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { versionedAggregateRepoDbConfig } from '../versionedAggregateRepoDbConfig.js';

import { onDOActivation } from './onDOActivation.js';

afterEach(() => vi.restoreAllMocks());

it.each(['transport', 'encoded'])(
  'declares every pin before subscribing and resumes after %s failure',
  async failureKind => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: versionedAggregateRepoDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const key = {
      systemId: 'sys_test',
      aggregateName: 'user',
      aggregateId: 'acct_activation',
      aggregateVersion: '1.0.0',
    };
    const table = versionedAggregateRepoDbConfig.schema.services;
    let fail = true;
    const enroll = vi.fn(async () => {
      expect(
        db
          .select()
          .from(table)
          .all()
          .map(row => row.serviceName)
          .sort(),
      ).toEqual(['app', 'inventory']);
      if (fail) {
        fail = false;
        // Simulate already committed catch-up before the enrollment request fails.
        db.update(table).set({ lastIndex: 4 }).run();
        if (failureKind === 'transport') throw new Error('unavailable');
        return encodeFailure(new ZerospinError({ code: 'source-unavailable' }));
      }
      return encodeSuccess(undefined);
    });
    const activation = onDOActivation({
      repo: {
        db,
        key,
        aggregateFanoutQueueSubscriber: sourceKey =>
          makeFanoutSubscriber({
            name: 'aggregateFanoutQueue',
            sourceKey,
            key,
            getRepo: () =>
              Effect.succeed({
                aggregateFanoutQueue: Promise.resolve({
                  getPage: async () =>
                    encodeSuccess({ rows: [], lastIndex: 0 }),
                  subscribe: enroll,
                }),
              }),
            getCurrentIndex: () => 4,
            receive: () => Effect.void,
          }),
      },
    }).pipe(Effect.provide(AsyncLive));
    expect(
      await Effect.runPromise(activation.pipe(Effect.result)),
    ).toMatchObject({ _tag: 'Failure' });
    const originalHead = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.head)
      .get();
    expect(originalHead).toEqual({
      singletonId: 1,
      aggregateIndex: 0,
      dispositionHash: genesisDispositionHash(),
    });
    await Effect.runPromise(activation);
    expect(
      db.select().from(versionedAggregateRepoDbConfig.schema.head).get(),
    ).toEqual(originalHead);
    expect(enroll).toHaveBeenCalledTimes(3);
    expect(db.select().from(table).all()).toEqual([
      {
        serviceName: 'app',
        lastIndex: 4,
      },
      {
        serviceName: 'inventory',
        lastIndex: 4,
      },
    ]);
  },
);

it('retains the existing execution head on activation', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: versionedAggregateRepoDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const head = {
    singletonId: 1,
    aggregateIndex: 7,
    dispositionHash: 'retained-hash',
  };
  db.insert(versionedAggregateRepoDbConfig.schema.head).values(head).run();
  await Effect.runPromise(
    onDOActivation({
      repo: {
        db,
        key: {
          systemId: 'sys_test',
          aggregateName: 'notes',
          aggregateId: 'acct_head',
          aggregateVersion: '1.0.0',
        },
        aggregateFanoutQueueSubscriber: () => {
          throw new Error('No service subscription expected');
        },
      },
    }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db.select().from(versionedAggregateRepoDbConfig.schema.head).get(),
  ).toEqual(head);
});
