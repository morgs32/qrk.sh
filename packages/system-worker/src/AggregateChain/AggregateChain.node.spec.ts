import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import type { IDb } from '@zerospin/core/drizzle/types';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { expect, it, vi } from 'vitest';

import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';

import { admitCommands } from './admitCommands/admitCommands.js';
import { AggregateChain } from './AggregateChain.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

const { receive, setAlarm, deleteAlarm } = vi.hoisted(() => ({
  receive:
    vi.fn<
      (delivery: {
        rows: readonly { aggregateIndex: number }[];
        lastIndex: number;
      }) => Promise<ReturnType<typeof encodeSuccess<void>>>
    >(),
  setAlarm: vi.fn(async () => undefined),
  deleteAlarm: vi.fn(async () => undefined),
}));

// Replace only the DO construction boundary; admission, fanout, and SQL are real.
vi.mock('../makeFixedDORepo/makeFixedDORepo.js', () => ({
  makeFixedDORepo: (props: { fixedDORepoConfig: unknown }) =>
    class {
      static readonly fixedDORepoConfig = props.fixedDORepoConfig;
      readonly ctx = { storage: { setAlarm, deleteAlarm } };
      readonly alarmRegistry = makeAlarmRegistry({ storage: this.ctx.storage });
      readonly schema = aggregateChainDbConfig.schema;
      readonly key = {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
      };

      constructor(readonly db: IDb) {}
    },
}));

vi.mock(
  '../VersionedAggregateRepo/VersionedAggregateRepo.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../VersionedAggregateRepo/VersionedAggregateRepo.js')
      >();

    Object.assign(actual.VersionedAggregateRepo, {
      getRepo: () =>
        Effect.succeed({
          versionedAggregateFanoutQueueSubscriber: async () => ({
            receive,
          }),
        }),
    });
    return actual;
  },
);

it.each([
  {
    scenario: 'returns admission receipts while delivery is blocked',
    failSecond: false,
    retained: false,
  },
  {
    scenario:
      'returns the admission failure without delivering rolled-back rows',
    failSecond: true,
    retained: false,
  },
  {
    scenario:
      'returns a failed batch while previously committed delivery is blocked',
    failSecond: true,
    retained: true,
  },
])('$scenario', async ({ failSecond, retained }) => {
  receive.mockReset();
  setAlarm.mockClear();
  deleteAlarm.mockClear();
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  db.insert(aggregateChainDbConfig.schema.versionedAggregateRepos)
    .values({
      versionedAggregateRepoName: 'var_sys_test/acct_test/user/1.0.0',
      aggregateVersion: '1.0.0',
      active: true,
      currentIndex: 0,
    })
    .run();
  if (failSecond) {
    db.run(sql`CREATE TRIGGER fail_second_admission AFTER INSERT ON admittedCommands
      WHEN NEW.commandId = 'cmd_background_2'
      BEGIN SELECT RAISE(FAIL, 'injected admission failure'); END`);
  }
  const commands = [1, 2].map(index =>
    Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: `cmd_background_${index}`,
      commandName: 'test',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_test',
      aggregateVersion: '1.0.0',
      aggregateName: 'user',
      systemName: 'system-worker',
      userId: null,
      sessionId: null,
      frontendName: null,
      pushIndex: null,
    }),
  );
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let completed = false;
  receive.mockImplementation(async () => {
    started.resolve();
    await release.promise;
    completed = true;
    return encodeSuccess(undefined);
  });
  const chain: AggregateChain = Reflect.construct(AggregateChain, [db]);

  if (retained) {
    Effect.runSync(
      admitCommands({
        db,
        key: chain.key,
        commands: [{ ...commands[0]!, id: 'cmd_previous' }],
      }),
    );
  }
  const indexes = failSecond ? (retained ? [1] : []) : [1, 2];

  try {
    const result = await chain.admitCommands({ commands });
    expect(receive).not.toHaveBeenCalled();
    const recovery = Effect.runPromise(
      chain.alarmRegistry.run().pipe(Effect.provide(AsyncLive)),
    );
    void recovery.catch(() => undefined);
    if (indexes.length > 0) await started.promise;
    else await chain.versionedAggregateFanoutQueue.drain();

    expect(completed).toBe(false);
    expect(setAlarm).toHaveBeenCalled();
    if (indexes.length > 0) expect(deleteAlarm).not.toHaveBeenCalled();
    if (failSecond) {
      expect(result).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-admission-failed' },
      });
    } else {
      expect(result).toEqual(
        encodeSuccess([
          { aggregateIndex: 1, commandId: 'cmd_background_1' },
          { aggregateIndex: 2, commandId: 'cmd_background_2' },
        ]),
      );
    }
    expect(receive).toHaveBeenCalledTimes(indexes.length > 0 ? 1 : 0);
    if (indexes.length > 0) {
      expect(
        receive.mock.calls[0]![0].rows.map(row => row.aggregateIndex),
      ).toEqual(indexes);
    }
    expect(
      db.select().from(aggregateChainDbConfig.schema.admittedCommands).all(),
    ).toHaveLength(indexes.length);
  } finally {
    release.resolve();
    await chain.versionedAggregateFanoutQueue.drain();
  }
  expect(completed).toBe(indexes.length > 0);
});
