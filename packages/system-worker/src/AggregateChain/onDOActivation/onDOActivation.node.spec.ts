import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

import { makeAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

import { onDOActivation } from './onDOActivation.js';

const deployed = vi.hoisted(() => {
  const versions: Record<string, object> = {};
  return { versions };
});
vi.mock('system', () => ({
  system: {
    aggregates: {
      get user() {
        return deployed.versions;
      },
    },
  },
}));
vi.mock('../../VersionedAggregateRepo/VersionedAggregateRepo.js', () => ({
  VersionedAggregateRepo: {
    fixedDORepoConfig: {
      nameUtils: {
        makeName: (key: { aggregateVersion: string }) =>
          Effect.succeed(`aggregate_user_${key.aggregateVersion}`),
      },
    },
  },
}));

it('reconciles membership and resumes retained progress after removal and re-addition', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: aggregateChainDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  const setAlarm = vi.fn(async () => undefined);
  const alarms = makeAlarmRegistry({
    storage: { setAlarm, deleteAlarm: async () => undefined },
  });
  const key = {
    systemId: 'sys_test',
    aggregateId: 'acct_test',
    aggregateName: 'user',
  };
  deployed.versions = { '2.0.0': {}, '1.0.0': {} };
  await Effect.runPromise(
    onDOActivation({ db, key, alarms }).pipe(Effect.provide(AsyncLive)),
  );
  const table = aggregateChainDbConfig.schema.versionedAggregateRepos;
  expect(
    db
      .select()
      .from(table)
      .all()
      .map(row => [row.aggregateVersion, row.active, row.currentIndex]),
  ).toEqual([
    ['2.0.0', true, null],
    ['1.0.0', true, null],
  ]);
  expect(setAlarm).toHaveBeenCalled();
  db.update(table)
    .set({ currentIndex: 7, failure: 'retained delivery failure' })
    .where(eq(table.aggregateVersion, '1.0.0'))
    .run();
  deployed.versions = { '2.0.0': {}, '3.0.0': {} };
  await Effect.runPromise(
    onDOActivation({ db, key, alarms }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db.select().from(table).where(eq(table.aggregateVersion, '1.0.0')).get(),
  ).toMatchObject({
    active: false,
    currentIndex: 7,
    failure: 'retained delivery failure',
  });
  expect(
    db.select().from(table).where(eq(table.aggregateVersion, '3.0.0')).get(),
  ).toMatchObject({ active: true, currentIndex: null });
  deployed.versions = { '1.0.0': {}, '3.0.0': {} };
  await Effect.runPromise(
    onDOActivation({ db, key, alarms }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db.select().from(table).where(eq(table.aggregateVersion, '1.0.0')).get(),
  ).toMatchObject({
    active: true,
    currentIndex: 7,
    failure: 'retained delivery failure',
  });
  deployed.versions = {};
  await Effect.runPromise(
    onDOActivation({ db, key, alarms }).pipe(Effect.provide(AsyncLive)),
  );
  expect(db.select().from(table).all()).toHaveLength(3);
  expect(
    db
      .select()
      .from(table)
      .all()
      .every(row => !row.active),
  ).toBe(true);
});
